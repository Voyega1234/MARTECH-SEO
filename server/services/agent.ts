import Anthropic from '@anthropic-ai/sdk';
import { mcpTools } from '@anthropic-ai/sdk/helpers/beta/mcp';
import { getMcpClient, closeMcpClient } from '../config/mcp.ts';

let anthropic: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new AgentError(
        'ANTHROPIC_API_KEY not set',
        'missing_api_key',
        'Set ANTHROPIC_API_KEY in your .env file. Get one at https://console.anthropic.com'
      );
    }
    anthropic = new Anthropic();
  }
  return anthropic;
}

function getOutputModel(): string {
  return process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
}

const CLAUDE_MAX_ATTEMPTS = 3;

// --- Custom error class with user-friendly messages ---
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

// --- Map known errors to user-friendly messages ---
function classifyError(err: any): AgentError {
  const msg = err?.message || String(err);
  const status = err?.status || err?.statusCode;

  // 1. API key issues
  if (msg.includes('authentication') || msg.includes('api_key') || status === 401) {
    return new AgentError(msg, 'auth_error', 'Invalid API key. Please check your ANTHROPIC_API_KEY in .env');
  }

  // 2. Rate limiting
  if (msg.includes('rate_limit') || status === 429) {
    return new AgentError(msg, 'rate_limit', 'Rate limited by Claude API. Please wait a moment and try again.', true);
  }

  // 3. Insufficient credits
  if (msg.includes('credit') || msg.includes('billing') || msg.includes('insufficient')) {
    return new AgentError(msg, 'no_credits', 'Insufficient API credits. Add credits at console.anthropic.com/billing');
  }

  // 4. Model overloaded
  if (msg.includes('overloaded') || status === 529) {
    return new AgentError(msg, 'overloaded', 'Claude is currently overloaded. Please try again in a few minutes.', true);
  }

  // 5. Context too long
  if (msg.includes('context') || msg.includes('too many tokens') || msg.includes('max_tokens')) {
    return new AgentError(msg, 'context_overflow', 'Request too large — keyword data exceeded context limit. Try fewer product lines.');
  }

  // 6. Network / timeout
  if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed') || msg.includes('ECONNRESET') || msg.includes('terminated')) {
    return new AgentError(msg, 'network_error', 'Connection to Claude API was interrupted. Retrying...', true);
  }

  // 7. MCP server connection failure
  if (msg.includes('MCP') || msg.includes('dataforseo') || msg.includes('spawn') || msg.includes('ENOENT')) {
    return new AgentError(msg, 'mcp_error', 'DataForSEO MCP server failed to start. Check DFS credentials in .env');
  }

  // 8. DFS API errors (invalid params)
  if (msg.includes('Invalid Field') || msg.includes('40501') || msg.includes('language_code')) {
    return new AgentError(msg, 'dfs_api_error', 'DataForSEO API error — invalid parameters sent. This is usually auto-fixed on retry.', true);
  }

  // 9. Server error (500 from Anthropic)
  if (status === 500 || msg.includes('internal_error')) {
    return new AgentError(msg, 'server_error', 'Claude API server error. Please try again.', true);
  }

  // 10. Unknown
  return new AgentError(msg, 'unknown', `Something went wrong: ${msg.slice(0, 150)}`);
}

interface AgentResult {
  success: boolean;
  result: string;
  toolsUsed: string[];
  error?: { code: string; message: string; retryable: boolean };
}

type ClaudeJsonSchemaConfig = {
  name: string;
  schema: Record<string, unknown>;
};

// --- Cache MCP tools ---
let cachedTools: any[] | null = null;

async function getTools() {
  if (cachedTools) return cachedTools;

  try {
    const mcpClient = await getMcpClient();
    const { tools } = await mcpClient.listTools();
    cachedTools = mcpTools(tools, mcpClient as any);
    console.log(`[Cache] MCP tools cached: ${cachedTools.length} tools`);
    return cachedTools;
  } catch (err) {
    // MCP connection failed — clear state and throw friendly error
    cachedTools = null;
    await closeMcpClient().catch(() => {});
    throw new AgentError(
      (err as Error).message,
      'mcp_error',
      'Failed to connect to DataForSEO MCP server. Check that DFS_API_LOGIN and DFS_API_PASSWORD are set correctly in .env'
    );
  }
}

export function clearToolsCache() {
  cachedTools = null;
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
              if (r.keyword !== undefined) {
                return slimDfsKeywordResult(r);
              }
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

// Execute a tool call with retry
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
      const errMsg = (err as Error).message;
      console.error(`[Tool] ${toolName} attempt ${attempt} failed: ${errMsg}`);

      if (attempt === maxRetries) {
        return `Error calling ${toolName}: ${errMsg}`;
      }

      // Wait before retry
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return `Error: ${toolName} failed after ${maxRetries} attempts`;
}

function elapsed(startMs: number): string {
  return ((Date.now() - startMs) / 1000).toFixed(1) + 's';
}

// --- Extract tool result data from conversation for Phase 2 ---
// --- Retry wrapper for Claude API calls ---
async function callClaudeWithRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = CLAUDE_MAX_ATTEMPTS
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const classified = classifyError(err);
      console.error(`[${label}] Attempt ${attempt} failed: ${classified.code} — ${classified.message}`);

      if (!classified.retryable || attempt === maxRetries) {
        throw classified;
      }

      const backoff = attempt * 2000;
      console.log(`[${label}] Retrying in ${backoff / 1000}s...`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw new AgentError('Unreachable', 'unknown', 'Unexpected error');
}

// Single-phase agent: Sonnet + MCP (like Claude Desktop)
// One model does research AND generation in the same conversation.
export async function runAgent(
  systemPrompt: string,
  userMessage: string,
): Promise<AgentResult> {
  const totalStart = Date.now();

  const tools = await getTools();
  const client = getClient();
  const outputModel = getOutputModel();
  const allToolsUsed: string[] = [];

  const jsonEnforcement = '\n\nCRITICAL: Your FINAL response must be ONLY a valid JSON object — no markdown, no code fences, no text before or after. Start with { and end with }.';

  let messages: any[] = [{ role: 'user', content: userMessage }];
  let loopCount = 0;
  const maxLoops = 15;
  let totalToolTime = 0;

  console.log(`\n[Agent] Single-phase with ${outputModel} + MCP tools`);

  while (loopCount < maxLoops) {
    loopCount++;

    const claudeStart = Date.now();
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
    const claudeMs = Date.now() - claudeStart;

    console.log(`[Agent] Loop ${loopCount} | ${outputModel}: ${(claudeMs / 1000).toFixed(1)}s | Stop: ${response.stop_reason} | Tokens: ${JSON.stringify(response.usage)}`);

    // If model finished (end_turn), extract the text output
    if (response.stop_reason === 'end_turn') {
      const textBlocks = response.content.filter((b: any) => b.type === 'text');
      const fullText = textBlocks.map((b: any) => b.text).join('');
      console.log(`[Agent] Done | ${loopCount} loops | Tools: ${(totalToolTime / 1000).toFixed(1)}s | Total: ${elapsed(totalStart)}`);
      return { success: true, result: fullText, toolsUsed: allToolsUsed };
    }

    // Handle tool calls
    const toolUseBlocks = response.content.filter((b: any) => b.type === 'tool_use');

    if (toolUseBlocks.length === 0) {
      // No tool calls and not end_turn — extract whatever text we have
      const textBlocks = response.content.filter((b: any) => b.type === 'text');
      const fullText = textBlocks.map((b: any) => b.text).join('');
      console.log(`[Agent] Done (no tools, stop: ${response.stop_reason}) | Total: ${elapsed(totalStart)}`);
      return { success: true, result: fullText, toolsUsed: allToolsUsed };
    }

    messages.push({ role: 'assistant', content: response.content });
    const toolResults: any[] = [];

    for (const block of toolUseBlocks) {
      const toolBlock = block as any;
      allToolsUsed.push(toolBlock.name);

      const toolStart = Date.now();
      const result = await executeTool(tools, toolBlock.name, toolBlock.input);
      const toolMs = Date.now() - toolStart;
      totalToolTime += toolMs;

      console.log(`[Agent]   Tool: ${toolBlock.name} | ${(toolMs / 1000).toFixed(1)}s | Result: ${result.length} chars`);

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolBlock.id,
        content: result,
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  // If we hit maxLoops, extract whatever text is in the last assistant message
  console.warn(`[Agent] Hit max loops (${maxLoops})`);
  const lastAssistant = messages.filter((m: any) => m.role === 'assistant').pop();
  const fallbackText = lastAssistant?.content
    ?.filter((b: any) => b.type === 'text')
    ?.map((b: any) => b.text)
    ?.join('') || '';

  console.log(`[Agent] Done (max loops) | Total: ${elapsed(totalStart)}`);
  return { success: true, result: fallbackText, toolsUsed: allToolsUsed };
}

// Generate-only (no research phase) — for sitemap where keyword data is already available
export async function generateOnly(
  systemPrompt: string,
  userMessage: string,
  options?: { responseMode?: 'json' | 'text'; model?: string; jsonSchema?: ClaudeJsonSchemaConfig },
): Promise<AgentResult> {
  const totalStart = Date.now();
  const client = getClient();
  const outputModel = options?.model || getOutputModel();

  console.log(`\n[Agent-GenerateOnly] Starting with ${outputModel}`);

  let fullText = '';
  const responseMode = options?.responseMode || 'json';
  const systemSuffix = responseMode === 'json'
    ? '\n\nCRITICAL: Your response must be ONLY a raw JSON object. Start with { and end with }. No markdown, no code fences, no text before or after. Output pure JSON only.'
    : '\n\nCRITICAL: Return ONLY the final plain-text answer requested by the prompt. No markdown, no bullets, no explanation before or after.';
  const userSuffix = responseMode === 'json'
    ? '\n\nRemember: Output ONLY the JSON object. No text, no markdown, no explanation. Start with { and end with }.'
    : '\n\nRemember: Output ONLY the final plain-text answer requested. No markdown or explanation.';
  const response = await callClaudeWithRetry(
    async () => {
      if (responseMode === 'json' && options?.jsonSchema) {
        fullText = '';
        const stream = client.messages.stream({
          model: outputModel,
          max_tokens: 64000,
          system: systemPrompt + systemSuffix,
          messages: [
            {
              role: 'user',
              content: `${userMessage}${userSuffix}`,
            },
          ],
          output_config: {
            format: {
              type: 'json_schema',
              schema: options.jsonSchema.schema,
            },
          },
        } as any);

        return stream.on('text', (text) => {
          fullText += text;
        }).finalMessage();
      }

      fullText = '';
      const stream = client.messages.stream({
        model: outputModel,
        max_tokens: 64000,
        system: systemPrompt + systemSuffix,
        messages: [
          {
            role: 'user',
            content: `${userMessage}${userSuffix}`,
          },
        ],
      });

      return stream.on('text', (text) => {
        fullText += text;
      }).finalMessage();
    },
    'Agent-GenerateOnly'
  );

  const generateMs = Date.now() - totalStart;
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
  const totalStart = Date.now();
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  try {
    const tools = await getTools();
    const client = getClient();
    const outputModel = getOutputModel();

    const jsonEnforcement = '\n\nCRITICAL: Your FINAL response must be ONLY a valid JSON object — no markdown, no code fences, no text before or after. Start with { and end with }.';

    let messages: any[] = [{ role: 'user', content: userMessage }];
    let loopCount = 0;
    const maxLoops = 15;
    let totalToolTime = 0;
    let consecutiveFailedLoops = 0;

    const status = (msg: string) => {
      if (callbacks.onStatus) callbacks.onStatus(msg);
      else callbacks.onText(msg);
    };

    console.log('\n========================================');
    console.log(`[Stream] Single-phase with ${outputModel} + MCP`);
    console.log('========================================\n');

    // Heartbeat: keep SSE connection alive
    heartbeat = setInterval(() => { status(''); }, 15_000);

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
        console.error(`[Stream] Loop ${loopCount} failed: ${classified.code}`);

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

        console.log('\n========================================');
        console.log(`[Stream] DONE | ${loopCount} loops | Tools: ${(totalToolTime / 1000).toFixed(1)}s | Total: ${elapsed(totalStart)}`);
        console.log(`[Stream] Output: ${fullText.length} chars`);
        console.log('========================================\n');

        if (heartbeat) clearInterval(heartbeat);
        callbacks.onDone(fullText);
        return;
      }

      // Handle tool calls
      const toolUseBlocks = response.content.filter((b: any) => b.type === 'tool_use');

      if (toolUseBlocks.length === 0) {
        const textBlocks = response.content.filter((b: any) => b.type === 'text');
        const fullText = textBlocks.map((b: any) => b.text).join('');
        if (heartbeat) clearInterval(heartbeat);
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
        const toolMs = Date.now() - toolStart;
        totalToolTime += toolMs;

        console.log(`[Stream]   Tool: ${toolBlock.name} | ${(toolMs / 1000).toFixed(1)}s | Result: ${result.length} chars`);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: result,
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    // Hit max loops — extract last text
    console.warn(`[Stream] Hit max loops (${maxLoops})`);
    const lastAssistant = messages.filter((m: any) => m.role === 'assistant').pop();
    const fallbackText = lastAssistant?.content
      ?.filter((b: any) => b.type === 'text')
      ?.map((b: any) => b.text)
      ?.join('') || '';

    if (heartbeat) clearInterval(heartbeat);
    callbacks.onDone(fallbackText);

  } catch (err) {
    if (heartbeat) clearInterval(heartbeat);
    const classified = err instanceof AgentError ? err : classifyError(err);
    console.error(`[Stream] Fatal error: ${classified.code} — ${classified.message}`);
    callbacks.onError(classified.userMessage);
  }
}
