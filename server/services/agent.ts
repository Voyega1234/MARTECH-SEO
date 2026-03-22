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

// Two models: fast for research, quality for output
const RESEARCH_MODEL = 'claude-haiku-4-5-20251001';

function getOutputModel(): string {
  return process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
}

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
  if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')) {
    return new AgentError(msg, 'network_error', 'Cannot reach Claude API. Check your internet connection.', true);
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

// --- Retry wrapper for Claude API calls ---
async function callClaudeWithRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 2
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

// Non-streaming (uses two-model approach)
export async function runAgent(
  systemPrompt: string,
  userMessage: string,
): Promise<AgentResult> {
  const totalStart = Date.now();

  const tools = await getTools();
  const client = getClient();
  const outputModel = getOutputModel();
  const allToolsUsed: string[] = [];

  let messages: any[] = [{ role: 'user', content: userMessage }];
  let loopCount = 0;
  const maxLoops = 15;
  let totalResearchTime = 0;
  let totalToolTime = 0;

  // ===== Phase 1: Research with Haiku =====
  console.log(`\n[Agent] Phase 1: Research with ${RESEARCH_MODEL}`);

  const researchSystemPrompt = systemPrompt + `\n\nIMPORTANT: You are in RESEARCH PHASE. Your job is to gather keyword data using DFS tools. Do NOT produce the final JSON output yet. Just call the necessary tools to collect keyword and volume data. Be efficient — batch queries, avoid duplicate calls, aim for 5-8 tool calls total.`;

  while (loopCount < maxLoops) {
    loopCount++;

    const claudeStart = Date.now();
    // Use streaming to avoid Anthropic SDK timeout on long requests
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
    const claudeMs = Date.now() - claudeStart;
    totalResearchTime += claudeMs;

    console.log(`[Agent] Research loop ${loopCount} | Haiku: ${(claudeMs / 1000).toFixed(1)}s | Tokens: ${JSON.stringify(response.usage)}`);

    const toolUseBlocks = response.content.filter((b: any) => b.type === 'tool_use');

    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
      console.log('[Agent] Research phase complete — no more tool calls');
      break;
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

  // ===== Phase 2: Generate with Sonnet =====
  console.log(`\n[Agent] Phase 2: Generate with ${outputModel}`);

  const collectedData = extractToolData(messages);

  if (!collectedData.trim()) {
    console.warn('[Agent] No tool data collected — Phase 1 may have failed silently');
  }

  const generateStart = Date.now();

  // Use streaming internally to avoid Anthropic SDK timeout on long requests
  let fullText = '';
  const stream = client.beta.messages.stream({
    model: outputModel,
    max_tokens: 64000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `${userMessage}\n\n--- KEYWORD DATA (from DFS research) ---\n${collectedData}`,
      },
    ],
    betas: ['mcp-client-2025-11-20'],
  });

  const generateResponse = await stream.on('text', (text) => {
    fullText += text;
  }).finalMessage();

  const generateMs = Date.now() - generateStart;

  // Validate output is JSON
  if (!fullText.trim().startsWith('{')) {
    console.warn('[Agent] Output does not look like JSON — may need re-generation');
  }

  console.log(`[Agent] Generate: ${(generateMs / 1000).toFixed(1)}s | Tokens: ${JSON.stringify(generateResponse.usage)}`);
  console.log(`[Agent] Done | Research: ${(totalResearchTime / 1000).toFixed(1)}s | Tools: ${(totalToolTime / 1000).toFixed(1)}s | Generate: ${(generateMs / 1000).toFixed(1)}s | Total: ${elapsed(totalStart)}`);

  return { success: true, result: fullText, toolsUsed: allToolsUsed };
}

// Streaming version with two-model approach
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

  // Wrap entire flow in try/catch for top-level errors
  try {
    const tools = await getTools();

    const client = getClient();
    const outputModel = getOutputModel();

    let messages: any[] = [{ role: 'user', content: userMessage }];
    let loopCount = 0;
    const maxLoops = 15;
    let totalResearchTime = 0;
    let totalToolTime = 0;
    let consecutiveFailedLoops = 0;

    console.log('\n========================================');
    console.log('[Stream] Phase 1: RESEARCH with', RESEARCH_MODEL);
    console.log('[Stream] Phase 2 will use:', outputModel);
    console.log('[Stream] User message:', userMessage.length, 'chars');
    console.log('========================================\n');

    // ===== Phase 1: Research with Haiku =====
    const researchSystemPrompt = systemPrompt + `\n\nIMPORTANT: You are in RESEARCH PHASE. Your job is to gather keyword data using DFS tools. Do NOT produce the final JSON output yet. Just call the necessary tools to collect keyword and volume data. Be efficient — batch queries, avoid duplicate calls, aim for 5-8 tool calls total.`;

    const status = (msg: string) => {
      if (callbacks.onStatus) callbacks.onStatus(msg);
      else callbacks.onText(msg);
    };

    status('[Researching keywords with DFS tools...]\n');

    // Heartbeat: send a status event every 15s during long-running operations
    // This keeps the SSE connection alive and flushes any proxy/OS buffers
    heartbeat = setInterval(() => {
      status('');  // empty status keeps connection alive
    }, 15_000);

    while (loopCount < maxLoops) {
      loopCount++;
      console.log(`\n[Stream] --- Research Loop ${loopCount}/${maxLoops} ---`);
      status(`\n[Research loop ${loopCount}...]\n`);

      const claudeStart = Date.now();

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
        console.error(`[Stream] Research loop ${loopCount} failed: ${classified.code}`);

        // If retryable and we haven't failed too many times, skip this loop
        consecutiveFailedLoops++;
        if (classified.retryable && consecutiveFailedLoops < 3) {
          status(`\n[Retrying research... (${classified.code})]\n`);
          continue;
        }

        // Non-retryable or too many failures — proceed to Phase 2 with whatever data we have
        console.warn('[Stream] Proceeding to Phase 2 with partial data');
        status(`\n[Research interrupted: ${classified.userMessage}. Generating with available data...]\n`);
        break;
      }

      consecutiveFailedLoops = 0;
      const claudeMs = Date.now() - claudeStart;
      totalResearchTime += claudeMs;

      console.log(`[Stream] Haiku: ${(claudeMs / 1000).toFixed(1)}s | Stop: ${response.stop_reason} | Tokens: ${JSON.stringify(response.usage)}`);

      const toolUseBlocks = response.content.filter((b: any) => b.type === 'tool_use');

      console.log(`[Stream] Tool calls: ${toolUseBlocks.length}`);

      if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
        console.log('[Stream] Research phase complete');
        break;
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

    // ===== Phase 2: Generate with Sonnet (streamed) =====
    console.log(`\n========================================`);
    console.log(`[Stream] Phase 2: GENERATE with ${outputModel}`);
    console.log(`========================================\n`);

    status('\n[Generating keyword map...]\n');

    const collectedData = extractToolData(messages);
    console.log(`[Stream] Collected data: ${collectedData.length} chars from tool results`);

    if (!collectedData.trim()) {
      console.warn('[Stream] No tool data collected — output may lack volume data');
      status('[Warning: No keyword data collected from DFS. Output may have estimated volumes.]\n');
    }

    let fullText = '';
    const generateStart = Date.now();

    const stream = client.beta.messages.stream({
      model: outputModel,
      max_tokens: 64000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `${userMessage}\n\n--- KEYWORD DATA (from DFS research) ---\n${collectedData}`,
        },
      ],
      betas: ['mcp-client-2025-11-20'],
    });

    // Handle stream-level errors
    stream.on('error', (err) => {
      const classified = classifyError(err);
      console.error(`[Stream] Stream error: ${classified.code} — ${classified.message}`);
    });

    const response = await stream.on('text', (text) => {
      fullText += text;
      callbacks.onText(text);
    }).finalMessage();

    const generateMs = Date.now() - generateStart;

    // Validate output
    if (response.stop_reason === 'max_tokens') {
      console.warn('[Stream] Output was truncated (max_tokens reached)');
      status('\n\n[Warning: Output was truncated. Try with fewer product lines.]');
    }

    console.log('\n========================================');
    console.log('[Stream] DONE');
    console.log(`[Stream] Research (Haiku): ${loopCount} loops, ${(totalResearchTime / 1000).toFixed(1)}s`);
    console.log(`[Stream] Tools (DFS): ${(totalToolTime / 1000).toFixed(1)}s`);
    console.log(`[Stream] Generate (${outputModel}): ${(generateMs / 1000).toFixed(1)}s`);
    console.log(`[Stream] Wall time: ${elapsed(totalStart)}`);
    console.log(`[Stream] Output: ${fullText.length} chars`);
    console.log(`[Stream] Tokens: ${JSON.stringify(response.usage)}`);
    console.log('========================================\n');

    if (heartbeat) clearInterval(heartbeat);
    callbacks.onDone(fullText);

  } catch (err) {
    if (heartbeat) clearInterval(heartbeat);
    const classified = err instanceof AgentError ? err : classifyError(err);
    console.error(`[Stream] Fatal error: ${classified.code} — ${classified.message}`);
    callbacks.onError(classified.userMessage);
  }
}
