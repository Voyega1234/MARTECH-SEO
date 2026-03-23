import Anthropic from '@anthropic-ai/sdk';
import { mcpTools } from '@anthropic-ai/sdk/helpers/beta/mcp';
import { createMcpClient, closeMcpClient } from './mcp.js';

function getOutputModel(): string {
  return process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
}

const CLAUDE_MAX_ATTEMPTS = 3;

export class AgentError extends Error {
  code: string;
  userMessage: string;
  retryable: boolean;

  constructor(message: string, code: string, userMessage: string, retryable = false) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.userMessage = userMessage;
    this.retryable = retryable;
  }
}

function classifyError(err: any): AgentError {
  const msg = err?.message || String(err);
  const status = err?.status || err?.statusCode;

  if (msg.includes('authentication') || msg.includes('api_key') || status === 401) {
    return new AgentError(msg, 'auth_error', 'Invalid API key. Please check your ANTHROPIC_API_KEY.');
  }
  if (msg.includes('rate_limit') || status === 429) {
    return new AgentError(msg, 'rate_limit', 'Rate limited by Claude API. Please wait and try again.', true);
  }
  if (msg.includes('credit') || msg.includes('billing') || msg.includes('insufficient')) {
    return new AgentError(msg, 'no_credits', 'Insufficient API credits.');
  }
  if (msg.includes('overloaded') || status === 529) {
    return new AgentError(msg, 'overloaded', 'Claude is currently overloaded. Try again in a few minutes.', true);
  }
  if (msg.includes('context') || msg.includes('too many tokens') || msg.includes('max_tokens')) {
    return new AgentError(msg, 'context_overflow', 'Request too large. Try fewer product lines.');
  }
  if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed') || msg.includes('ECONNRESET') || msg.includes('terminated')) {
    return new AgentError(msg, 'network_error', 'Connection to Claude API was interrupted. Retrying...', true);
  }
  if (msg.includes('MCP') || msg.includes('dataforseo') || msg.includes('spawn') || msg.includes('ENOENT')) {
    return new AgentError(msg, 'mcp_error', 'DataForSEO MCP server failed to start. Check DFS credentials.');
  }
  if (msg.includes('Invalid Field') || msg.includes('40501') || msg.includes('language_code')) {
    return new AgentError(msg, 'dfs_api_error', 'DataForSEO API error. This is usually auto-fixed on retry.', true);
  }
  if (status === 500 || msg.includes('internal_error')) {
    return new AgentError(msg, 'server_error', 'Claude API server error. Please try again.', true);
  }
  return new AgentError(msg, 'unknown', `Something went wrong: ${msg.slice(0, 150)}`);
}

interface AgentResult {
  success: boolean;
  result: string;
  toolsUsed: string[];
  error?: { code: string; message: string; retryable: boolean };
}

// --- Slim down DFS JSON responses ---
function slimDfsKeywordResult(item: any): any {
  return {
    keyword: item.keyword,
    search_volume: item.keyword_info?.search_volume ?? item.search_volume ?? null,
  };
}

function slimDfsResponse(parsed: any): any {
  if (parsed.tasks && Array.isArray(parsed.tasks)) {
    return {
      status_code: parsed.status_code,
      tasks: parsed.tasks.map((task: any) => ({
        status_code: task.status_code,
        result_count: task.result_count,
        result: Array.isArray(task.result)
          ? task.result.map((r: any) => {
              if (r.items && Array.isArray(r.items)) {
                return {
                  total_count: r.total_count,
                  items: r.items.slice(0, 50).map(slimDfsKeywordResult),
                };
              }
              if (r.keyword !== undefined) return slimDfsKeywordResult(r);
              return r;
            })
          : task.result,
      })),
    };
  }
  return parsed;
}

const MAX_TOOL_RESULT_LENGTH = 8000;

function truncateToolResult(result: string): string {
  try {
    const parsed = JSON.parse(result);
    const slimmed = slimDfsResponse(parsed);
    const slimmedStr = JSON.stringify(slimmed);
    if (slimmedStr.length <= MAX_TOOL_RESULT_LENGTH) return slimmedStr;
    return slimmedStr.slice(0, MAX_TOOL_RESULT_LENGTH) + `\n...[Truncated: ${slimmedStr.length} chars]`;
  } catch {
    // Not JSON
  }
  if (result.length <= MAX_TOOL_RESULT_LENGTH) return result;
  return result.slice(0, MAX_TOOL_RESULT_LENGTH) + `\n...[Truncated: ${result.length} chars]`;
}

async function executeTool(tools: any[], toolName: string, toolInput: any): Promise<string> {
  const tool = tools.find((t: any) => t.name === toolName);
  if (!tool) {
    return `Tool "${toolName}" not found. Available: ${tools.map((t: any) => t.name).join(', ')}`;
  }

  const maxRetries = 2;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const output = await tool.run(toolInput);
      let result: string;
      if (typeof output === 'string') {
        result = output;
      } else if (Array.isArray(output)) {
        result = output.map((item: any) => {
          if (item.type === 'text') return item.text;
          return JSON.stringify(item);
        }).join('\n');
      } else {
        result = JSON.stringify(output);
      }
      return truncateToolResult(result);
    } catch (err) {
      console.error(`[Tool] ${toolName} attempt ${attempt} failed: ${(err as Error).message}`);
      if (attempt === maxRetries) return `Error calling ${toolName}: ${(err as Error).message}`;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return `Error: ${toolName} failed after ${maxRetries} attempts`;
}

async function callClaudeWithRetry<T>(fn: () => Promise<T>, label: string, maxRetries = CLAUDE_MAX_ATTEMPTS): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const classified = classifyError(err);
      console.error(`[${label}] Attempt ${attempt} failed: ${classified.code}`);
      if (!classified.retryable || attempt === maxRetries) throw classified;
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  throw new AgentError('Unreachable', 'unknown', 'Unexpected error');
}

// Single-phase agent: Sonnet + MCP (like Claude Desktop)
export async function runAgent(systemPrompt: string, userMessage: string): Promise<AgentResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AgentError('ANTHROPIC_API_KEY not set', 'missing_api_key', 'Set ANTHROPIC_API_KEY environment variable.');
  }

  const startTime = Date.now();
  const client = new Anthropic();
  const outputModel = getOutputModel();
  const allToolsUsed: string[] = [];
  const mcpClient = await createMcpClient();

  const jsonEnforcement = '\n\nCRITICAL: Your FINAL response must be ONLY a valid JSON object — no markdown, no code fences, no text before or after. Start with { and end with }.';

  try {
    const { tools: rawTools } = await mcpClient.listTools();
    const tools = mcpTools(rawTools, mcpClient as any);

    let messages: any[] = [{ role: 'user', content: userMessage }];
    let loopCount = 0;
    const maxLoops = 15;
    let totalToolTime = 0;

    console.log(`\n[Agent] Single-phase with ${outputModel} + MCP tools`);

    while (loopCount < maxLoops) {
      loopCount++;
      const response = await callClaudeWithRetry(
        async () => {
          const stream = client.beta.messages.stream({
            model: outputModel,
            max_tokens: 64000,
            system: systemPrompt + jsonEnforcement,
            messages,
            tools,
            betas: ['mcp-client-2025-11-20'],
          });
          return stream.finalMessage();
        },
        `Agent-Loop-${loopCount}`
      );

      console.log(`[Agent] Loop ${loopCount} | Stop: ${response.stop_reason} | Tokens: ${JSON.stringify(response.usage)}`);

      // If model finished, extract text output
      if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
        const textBlocks = response.content.filter((b: any) => b.type === 'text');
        const fullText = textBlocks.map((b: any) => b.text).join('');
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Agent] Done | ${loopCount} loops | Tools: ${(totalToolTime / 1000).toFixed(1)}s | Total: ${elapsed}s`);
        return { success: true, result: fullText, toolsUsed: allToolsUsed };
      }

      const toolUseBlocks = response.content.filter((b: any) => b.type === 'tool_use');

      if (toolUseBlocks.length === 0) {
        const textBlocks = response.content.filter((b: any) => b.type === 'text');
        const fullText = textBlocks.map((b: any) => b.text).join('');
        return { success: true, result: fullText, toolsUsed: allToolsUsed };
      }

      messages.push({ role: 'assistant', content: response.content });
      const toolResults: any[] = [];

      for (const block of toolUseBlocks) {
        const toolBlock = block as any;
        allToolsUsed.push(toolBlock.name);
        const toolStart = Date.now();
        const result = await executeTool(tools, toolBlock.name, toolBlock.input);
        totalToolTime += Date.now() - toolStart;
        toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: result });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    // Hit max loops
    console.warn(`[Agent] Hit max loops (${maxLoops})`);
    const lastAssistant = messages.filter((m: any) => m.role === 'assistant').pop();
    const fallbackText = lastAssistant?.content
      ?.filter((b: any) => b.type === 'text')
      ?.map((b: any) => b.text)
      ?.join('') || '';

    return { success: true, result: fallbackText, toolsUsed: allToolsUsed };
  } finally {
    await closeMcpClient(mcpClient);
  }
}

// Generate-only (no research phase) — for sitemap where keyword data is already available
export async function generateOnly(
  systemPrompt: string,
  userMessage: string,
): Promise<AgentResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AgentError('ANTHROPIC_API_KEY not set', 'missing_api_key', 'Set ANTHROPIC_API_KEY environment variable.');
  }

  const client = new Anthropic();
  const outputModel = getOutputModel();

  console.log(`\n[Agent-GenerateOnly] Starting with ${outputModel}`);
  const startTime = Date.now();

  let fullText = '';
  const response = await callClaudeWithRetry(
    async () => {
      fullText = '';
      const stream = client.messages.stream({
        model: outputModel,
        max_tokens: 64000,
        system: systemPrompt + '\n\nCRITICAL: Your response must be ONLY a raw JSON object. Start with { and end with }. No markdown, no code fences, no text before or after. Output pure JSON only.',
        messages: [
          {
            role: 'user',
            content: `${userMessage}\n\nRemember: Output ONLY the JSON object. No text, no markdown, no explanation. Start with { and end with }.`,
          },
        ],
      });

      return stream.on('text', (text) => {
        fullText += text;
      }).finalMessage();
    },
    'Agent-GenerateOnly'
  );

  const generateMs = Date.now() - startTime;
  console.log(`[Agent-GenerateOnly] Done: ${(generateMs / 1000).toFixed(1)}s | Tokens: ${JSON.stringify(response.usage)}`);

  return { success: true, result: fullText, toolsUsed: [] };
}

// Streaming single-phase agent: Sonnet + MCP
export async function streamAgent(
  systemPrompt: string,
  userMessage: string,
  callbacks: {
    onText: (text: string) => void;
    onTool: (toolName: string) => void;
    onDone: (result: string) => void;
    onError: (error: string) => void;
    onStatus?: (status: string) => void;
  }
): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    callbacks.onError('ANTHROPIC_API_KEY not set.');
    return;
  }

  const status = (msg: string) => {
    if (callbacks.onStatus) callbacks.onStatus(msg);
    else callbacks.onText(msg);
  };

  const startTime = Date.now();
  const mcpClient = await createMcpClient();

  try {
    const client = new Anthropic();
    const outputModel = getOutputModel();

    const jsonEnforcement = '\n\nCRITICAL: Your FINAL response must be ONLY a valid JSON object — no markdown, no code fences, no text before or after. Start with { and end with }.';

    const { tools: rawTools } = await mcpClient.listTools();
    const tools = mcpTools(rawTools, mcpClient as any);

    let messages: any[] = [{ role: 'user', content: userMessage }];
    let loopCount = 0;
    const maxLoops = 15;
    let totalToolTime = 0;
    let consecutiveFailedLoops = 0;

    console.log(`\n[Stream] Single-phase with ${outputModel} + MCP`);

    while (loopCount < maxLoops) {
      loopCount++;

      let response;
      try {
        response = await callClaudeWithRetry(
          async () => {
            const s = client.beta.messages.stream({
              model: outputModel,
              max_tokens: 64000,
              system: systemPrompt + jsonEnforcement,
              messages,
              tools,
              betas: ['mcp-client-2025-11-20'],
            });
            return s.finalMessage();
          },
          `Stream-Loop-${loopCount}`
        );
      } catch (err) {
        const classified = err instanceof AgentError ? err : classifyError(err);
        consecutiveFailedLoops++;
        if (classified.retryable && consecutiveFailedLoops < 3) {
          status(`\n[Retrying... (${classified.code})]\n`);
          continue;
        }
        throw classified;
      }

      consecutiveFailedLoops = 0;
      console.log(`[Stream] Loop ${loopCount} | Stop: ${response.stop_reason} | Tokens: ${JSON.stringify(response.usage)}`);

      // If model finished, extract text output
      if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
        const textBlocks = response.content.filter((b: any) => b.type === 'text');
        const fullText = textBlocks.map((b: any) => b.text).join('');

        if (response.stop_reason === 'max_tokens') {
          status('\n\n[Warning: Output was truncated. Try with fewer product lines.]');
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Stream] Done | ${loopCount} loops | Tools: ${(totalToolTime / 1000).toFixed(1)}s | Total: ${elapsed}s`);

        callbacks.onDone(fullText);
        return;
      }

      const toolUseBlocks = response.content.filter((b: any) => b.type === 'tool_use');

      if (toolUseBlocks.length === 0) {
        const textBlocks = response.content.filter((b: any) => b.type === 'text');
        const fullText = textBlocks.map((b: any) => b.text).join('');
        callbacks.onDone(fullText);
        return;
      }

      messages.push({ role: 'assistant', content: response.content });
      const toolResults: any[] = [];

      for (const block of toolUseBlocks) {
        const toolBlock = block as any;
        callbacks.onTool(toolBlock.name);
        const toolStart = Date.now();
        const result = await executeTool(tools, toolBlock.name, toolBlock.input);
        totalToolTime += Date.now() - toolStart;
        toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: result });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    // Hit max loops
    console.warn(`[Stream] Hit max loops (${maxLoops})`);
    const lastAssistant = messages.filter((m: any) => m.role === 'assistant').pop();
    const fallbackText = lastAssistant?.content
      ?.filter((b: any) => b.type === 'text')
      ?.map((b: any) => b.text)
      ?.join('') || '';

    callbacks.onDone(fallbackText);
  } catch (err) {
    const classified = err instanceof AgentError ? err : classifyError(err);
    callbacks.onError(classified.userMessage);
  } finally {
    await closeMcpClient(mcpClient);
  }
}
