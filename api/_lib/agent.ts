import Anthropic from '@anthropic-ai/sdk';
import { mcpTools } from '@anthropic-ai/sdk/helpers/beta/mcp';
import { createMcpClient, closeMcpClient } from './mcp.js';

// Two models: fast for research, quality for output
const RESEARCH_MODEL = 'claude-haiku-4-5-20251001';

function getOutputModel(): string {
  return process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
}

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
  if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')) {
    return new AgentError(msg, 'network_error', 'Cannot reach Claude API. Check your connection.', true);
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
    search_volume: item.search_volume,
    competition: item.competition,
    cpc: item.cpc,
    ...(item.keyword_difficulty !== undefined && { keyword_difficulty: item.keyword_difficulty }),
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

function extractToolData(messages: any[]): string {
  const toolResults: string[] = [];
  for (const msg of messages) {
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'tool_result' && block.content) {
          toolResults.push(block.content);
        }
      }
    }
  }
  return toolResults.join('\n\n---\n\n');
}

async function callClaudeWithRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 2): Promise<T> {
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

// Time budget: stop research after this many seconds, leave rest for generation
const RESEARCH_DEADLINE_MS = 600_000; // 600s for research
const TOTAL_DEADLINE_MS = 750_000;    // 750s hard limit (leave 50s buffer before Vercel 800s)

// Non-streaming agent
export async function runAgent(systemPrompt: string, userMessage: string): Promise<AgentResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AgentError('ANTHROPIC_API_KEY not set', 'missing_api_key', 'Set ANTHROPIC_API_KEY environment variable.');
  }

  const startTime = Date.now();
  const client = new Anthropic();
  const outputModel = getOutputModel();
  const allToolsUsed: string[] = [];
  const mcpClient = await createMcpClient();

  try {
    const { tools: rawTools } = await mcpClient.listTools();
    const tools = mcpTools(rawTools, mcpClient as any);

    let messages: any[] = [{ role: 'user', content: userMessage }];
    let loopCount = 0;
    const maxLoops = 8;

    const researchSystemPrompt = systemPrompt + `\n\nIMPORTANT: You are in RESEARCH PHASE. Your job is to gather keyword data using DFS tools. Do NOT produce the final JSON output yet. Just call the necessary tools to collect keyword and volume data. Be efficient — batch queries, avoid duplicate calls, aim for 3-5 tool calls total. Be concise.`;

    while (loopCount < maxLoops) {
      // Check time budget
      if (Date.now() - startTime > RESEARCH_DEADLINE_MS) {
        console.log(`[Agent] Research deadline reached (${((Date.now() - startTime) / 1000).toFixed(0)}s). Moving to generation.`);
        break;
      }

      loopCount++;
      const response = await callClaudeWithRetry(
        async () => {
          const stream = client.beta.messages.stream({
            model: RESEARCH_MODEL,
            max_tokens: 4000,
            system: researchSystemPrompt,
            messages,
            tools,
            betas: ['mcp-client-2025-11-20'],
          });
          return stream.finalMessage();
        },
        `Agent-Research-Loop-${loopCount}`
      );

      const toolUseBlocks = response.content.filter((b: any) => b.type === 'tool_use');
      if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') break;

      messages.push({ role: 'assistant', content: response.content });
      const toolResults: any[] = [];

      for (const block of toolUseBlocks) {
        const toolBlock = block as any;
        allToolsUsed.push(toolBlock.name);
        const result = await executeTool(tools, toolBlock.name, toolBlock.input);
        toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: result });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    // Phase 2: Generate (use streaming to avoid SDK timeout on long requests)
    const collectedData = extractToolData(messages);
    let fullText = '';
    const generateStream = client.beta.messages.stream({
      model: outputModel,
      max_tokens: 64000,
      system: systemPrompt,
      messages: [{ role: 'user', content: `${userMessage}\n\n--- KEYWORD DATA (from DFS research) ---\n${collectedData}` }],
      betas: ['mcp-client-2025-11-20'],
    });

    await generateStream.on('text', (text) => {
      fullText += text;
    }).finalMessage();

    return { success: true, result: fullText, toolsUsed: allToolsUsed };
  } finally {
    await closeMcpClient(mcpClient);
  }
}

// Streaming agent
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

    const { tools: rawTools } = await mcpClient.listTools();
    const tools = mcpTools(rawTools, mcpClient as any);

    let messages: any[] = [{ role: 'user', content: userMessage }];
    let loopCount = 0;
    const maxLoops = 8;
    let consecutiveFailedLoops = 0;

    const researchSystemPrompt = systemPrompt + `\n\nIMPORTANT: You are in RESEARCH PHASE. Your job is to gather keyword data using DFS tools. Do NOT produce the final JSON output yet. Just call the necessary tools to collect keyword and volume data. Be efficient — batch queries, avoid duplicate calls, aim for 3-5 tool calls total. Be concise.`;

    status('[Researching keywords with DFS tools...]\n');

    while (loopCount < maxLoops) {
      // Check time budget
      const elapsed = Date.now() - startTime;
      if (elapsed > RESEARCH_DEADLINE_MS) {
        status(`\n[Research time limit reached (${(elapsed / 1000).toFixed(0)}s). Generating with collected data...]\n`);
        break;
      }

      loopCount++;

      let response;
      try {
        response = await callClaudeWithRetry(
          async () => {
            const s = client.beta.messages.stream({
              model: RESEARCH_MODEL,
              max_tokens: 4000,
              system: researchSystemPrompt,
              messages,
              tools,
              betas: ['mcp-client-2025-11-20'],
            });
            return s.finalMessage();
          },
          `Stream-Research-Loop-${loopCount}`
        );
      } catch (err) {
        const classified = err instanceof AgentError ? err : classifyError(err);
        consecutiveFailedLoops++;
        if (classified.retryable && consecutiveFailedLoops < 3) {
          status(`\n[Retrying research... (${classified.code})]\n`);
          continue;
        }
        status(`\n[Research interrupted: ${classified.userMessage}. Generating with available data...]\n`);
        break;
      }

      consecutiveFailedLoops = 0;
      const toolUseBlocks = response.content.filter((b: any) => b.type === 'tool_use');
      if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') break;

      messages.push({ role: 'assistant', content: response.content });
      const toolResults: any[] = [];

      for (const block of toolUseBlocks) {
        const toolBlock = block as any;
        callbacks.onTool(toolBlock.name);
        const result = await executeTool(tools, toolBlock.name, toolBlock.input);
        toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: result });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    // Phase 2: Generate (streamed)
    status('\n[Generating keyword map...]\n');
    const collectedData = extractToolData(messages);

    if (!collectedData.trim()) {
      status('[Warning: No keyword data collected from DFS. Output may have estimated volumes.]\n');
    }

    let fullText = '';
    const stream = client.beta.messages.stream({
      model: outputModel,
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: `${userMessage}\n\n--- KEYWORD DATA (from DFS research) ---\n${collectedData}` }],
      betas: ['mcp-client-2025-11-20'],
    });

    stream.on('error', (err) => {
      console.error(`[Stream] error: ${classifyError(err).code}`);
    });

    const response = await stream.on('text', (text) => {
      fullText += text;
      callbacks.onText(text);
    }).finalMessage();

    if (response.stop_reason === 'max_tokens') {
      status('\n\n[Warning: Output was truncated. Try with fewer product lines.]');
    }

    callbacks.onDone(fullText);
  } catch (err) {
    const classified = err instanceof AgentError ? err : classifyError(err);
    callbacks.onError(classified.userMessage);
  } finally {
    await closeMcpClient(mcpClient);
  }
}
