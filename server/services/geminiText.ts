import { GoogleGenAI } from '@google/genai';
import { AgentError } from './agent.ts';

type JsonSchemaConfig = {
  name: string;
  schema: Record<string, unknown>;
};

type GenerateTextOptions = {
  responseMode?: 'json' | 'text';
  model?: string;
  jsonSchema?: JsonSchemaConfig;
  temperature?: number;
};

let geminiClient: GoogleGenAI | null = null;
const GEMINI_MAX_ATTEMPTS = 4;
const GEMINI_BASE_RETRY_DELAY_MS = 1500;

function getGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY?.trim() || '';
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new AgentError(
      'GEMINI_API_KEY not set',
      'missing_api_key',
      'Set GEMINI_API_KEY in your .env file.'
    );
  }

  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }

  return geminiClient;
}

function classifyGeminiError(err: unknown): AgentError {
  const message = err instanceof Error ? err.message : String(err);

  if (/api key|authentication|permission|unauthorized|forbidden/i.test(message)) {
    return new AgentError(message, 'auth_error', 'Invalid or unauthorized GEMINI_API_KEY.');
  }

  if (/quota|rate|429|resource exhausted/i.test(message)) {
    return new AgentError(message, 'rate_limit', 'Rate limited by Gemini API. Please wait and try again.', true);
  }

  if (/too many tokens|context|input token/i.test(message)) {
    return new AgentError(message, 'context_overflow', 'Request too large for Gemini. Try fewer keywords.');
  }

  if (/fetch failed|etimedout|econnreset|enotfound|network/i.test(message)) {
    return new AgentError(message, 'network_error', 'Connection to Gemini API was interrupted. Retrying...', true);
  }

  return new AgentError(message, 'unknown', `Gemini error: ${message.slice(0, 150)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function generateOnlyWithGemini(
  systemPrompt: string,
  userMessage: string,
  options?: GenerateTextOptions
): Promise<{ success: boolean; result: string; toolsUsed: string[] }> {
  const client = getGeminiClient();
  const model = options?.model || 'gemini-3-pro-preview';
  const responseMode = options?.responseMode || 'json';
  const temperature = typeof options?.temperature === 'number' ? options.temperature : undefined;

  let lastError: AgentError | null = null;

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: userMessage,
        config: {
          systemInstruction: systemPrompt,
          ...(typeof temperature === 'number' ? { temperature } : {}),
          ...(responseMode === 'json' && options?.jsonSchema
            ? {
                responseMimeType: 'application/json',
                responseSchema: options.jsonSchema.schema,
              }
            : {}),
        },
      });

      return {
        success: true,
        result: response.text || '',
        toolsUsed: [],
      };
    } catch (err) {
      const classified = classifyGeminiError(err);
      lastError = classified;
      if (!classified.retryable || attempt === GEMINI_MAX_ATTEMPTS) {
        throw classified;
      }
      await sleep(GEMINI_BASE_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError || new AgentError('Unknown Gemini error', 'unknown', 'Gemini request failed.');
}

export type PreviewModelProvider = 'anthropic' | 'gemini';

function getPreviewProviderFromEnv(envKey: string): PreviewModelProvider {
  return (process.env[envKey] || 'gemini').trim().toLowerCase() === 'anthropic'
    ? 'anthropic'
    : 'gemini';
}

export function getKeywordGroupingPreviewModelSelection(): {
  provider: PreviewModelProvider;
  model: string;
} {
  const provider = getPreviewProviderFromEnv('KEYWORD_GROUPING_PREVIEW_PROVIDER');

  if (provider === 'anthropic') {
    return {
      provider,
      model: process.env.KEYWORD_GROUPING_PREVIEW_MODEL?.trim() || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    };
  }

  return {
    provider,
    model: process.env.KEYWORD_GROUPING_PREVIEW_MODEL?.trim() || 'gemini-3.1-pro-preview',
  };
}

export function getKeywordGroupingPreviewAssignmentModelSelection(): {
  provider: PreviewModelProvider;
  model: string;
} {
  const provider = getPreviewProviderFromEnv('KEYWORD_GROUPING_PREVIEW_ASSIGNMENT_PROVIDER');

  if (provider === 'anthropic') {
    return {
      provider,
      model:
        process.env.KEYWORD_GROUPING_PREVIEW_ASSIGNMENT_MODEL?.trim()
        || process.env.CLAUDE_MODEL
        || 'claude-sonnet-4-6',
    };
  }

  return {
    provider,
    model:
      process.env.KEYWORD_GROUPING_PREVIEW_ASSIGNMENT_MODEL?.trim()
      || 'gemini-3.1-flash-lite-preview',
  };
}
