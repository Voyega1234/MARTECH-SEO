import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AgentError, generateOnly } from '../_lib/agent.js';
import { getKeywordRelevanceFilterPrompt } from '../_lib/prompts.js';
import { getKeywordRelevanceFilterJsonSchema } from '../../shared/claudeStructuredSchemas.ts';

type RelevanceKeywordInput = {
  keyword: string;
  search_volume: number | '-' | null | undefined;
};

const RELEVANCE_FILTER_BATCH_SIZE = 250;
const RELEVANCE_FILTER_MODEL = process.env.CLAUDE_RELEVANCE_MODEL || 'claude-haiku-4-5';

function logRelevanceFilter(event: string, payload: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      scope: 'keyword-relevance-filter',
      event,
      timestamp: new Date().toISOString(),
      ...payload,
    })
  );
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof AgentError) {
    return {
      name: err.name,
      message: err.message,
      code: err.code,
      userMessage: err.userMessage,
      retryable: err.retryable,
      stack: err.stack,
    };
  }

  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }

  return {
    message: String(err),
  };
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const start = trimmed.indexOf('{');
  if (start < 0) {
    throw new Error('Could not find a valid JSON object in relevance filter output.');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(start, index + 1);
      }
    }
  }

  throw new Error('Could not find a complete JSON object in relevance filter output.');
}

function chunkRelevanceKeywords(
  keywords: RelevanceKeywordInput[],
  chunkSize: number
): RelevanceKeywordInput[][] {
  const sorted = [...keywords].sort((a, b) => {
    const aVolume = typeof a.search_volume === 'number' ? a.search_volume : -1;
    const bVolume = typeof b.search_volume === 'number' ? b.search_volume : -1;
    if (bVolume !== aVolume) return bVolume - aVolume;
    return a.keyword.localeCompare(b.keyword);
  });

  const chunks: RelevanceKeywordInput[][] = [];
  for (let index = 0; index < sorted.length; index += chunkSize) {
    chunks.push(sorted.slice(index, index + chunkSize));
  }
  return chunks;
}

function buildKeywordRelevanceUserMessage(
  formData: Record<string, any>,
  keywords: RelevanceKeywordInput[]
): string {
  const parts: string[] = [];
  parts.push(`Business Name: ${formData.businessName || 'N/A'}`);
  parts.push(`Website URL: ${formData.websiteUrl || 'N/A'}`);
  parts.push(`Business Description & Core Offerings: ${formData.businessDescription || 'N/A'}`);
  parts.push(`SEO Goals & Conversion Action: ${formData.seoGoals || 'N/A'}`);
  if (formData.mustRankKeywords?.length) {
    parts.push(`Priority Keywords:\n${formData.mustRankKeywords.map((k: string) => `- ${k}`).join('\n')}`);
  }
  if (formData.focusProductLines?.length) {
    parts.push(`Focus Product Lines:\n${formData.focusProductLines.map((p: string) => `- ${p}`).join('\n')}`);
  }

  const keywordLines = keywords.map((item, keywordIndex) => {
    const volume = typeof item.search_volume === 'number' ? item.search_volume : '-';
    return `- K${keywordIndex}: ${item.keyword} | ${volume}`;
  });
  parts.push(`Keyword Batch IDs (${keywords.length} keywords):\n${keywordLines.join('\n')}`);
  parts.push('CRITICAL: output ONLY relevant keyword indexes from this batch. Do not output keyword text.');

  return parts.join('\n\n');
}

function parseRelevantIndexes(raw: string, batchSize: number): number[] {
  const parsed = JSON.parse(extractJsonObject(raw));
  const indexes = Array.isArray(parsed?.relevant_indexes) ? parsed.relevant_indexes : [];
  const deduped = new Set<number>();

  for (const value of indexes) {
    const index = Number(value);
    if (!Number.isInteger(index)) continue;
    if (index < 0 || index >= batchSize) continue;
    deduped.add(index);
  }

  return [...deduped].sort((a, b) => a - b);
}

function validateFormData(formData: any): string | null {
  if (!formData) return 'formData is required';
  if (!formData.businessName?.trim()) return 'Business name is required';
  if (!formData.businessDescription?.trim()) return 'Business description is required';
  if (!formData.seoGoals?.trim()) return 'SEO goals are required';
  return null;
}

function errorResponse(err: any) {
  if (err instanceof AgentError) {
    return {
      error: err.userMessage,
      code: err.code,
      retryable: err.retryable,
    };
  }
  return {
    error: (err as Error).message || 'Unknown error',
    code: 'unknown',
    retryable: false,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = typeof req.headers['x-vercel-id'] === 'string'
    ? req.headers['x-vercel-id']
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { formData, keywords } = req.body;
    logRelevanceFilter('request_received', {
      requestId,
      method: req.method,
      keywordCount: Array.isArray(keywords) ? keywords.length : null,
      hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
      model: RELEVANCE_FILTER_MODEL,
      batchSize: RELEVANCE_FILTER_BATCH_SIZE,
      businessName: formData?.businessName || null,
    });

    const validationError = validateFormData(formData);
    if (validationError) {
      logRelevanceFilter('validation_failed', { requestId, validationError });
      return res.status(400).json({ error: validationError, code: 'validation' });
    }

    if (!Array.isArray(keywords) || !keywords.length) {
      logRelevanceFilter('validation_failed', { requestId, validationError: 'keywords are required' });
      return res.status(400).json({ error: 'keywords are required', code: 'validation' });
    }

    const systemPrompt = getKeywordRelevanceFilterPrompt();
    const keywordBatches = chunkRelevanceKeywords(keywords, RELEVANCE_FILTER_BATCH_SIZE);
    const relevantKeywords: RelevanceKeywordInput[] = [];
    const rawParts: string[] = [];

    for (let batchIndex = 0; batchIndex < keywordBatches.length; batchIndex += 1) {
      const batch = keywordBatches[batchIndex];
      const userMessage = buildKeywordRelevanceUserMessage(formData, batch);
      logRelevanceFilter('batch_started', {
        requestId,
        batchIndex: batchIndex + 1,
        batchCount: keywordBatches.length,
        batchKeywordCount: batch.length,
      });

      let result;
      try {
        result = await generateOnly(systemPrompt, userMessage, {
          model: RELEVANCE_FILTER_MODEL,
          jsonSchema: getKeywordRelevanceFilterJsonSchema(),
        });
      } catch (err) {
        logRelevanceFilter('claude_call_failed', {
          requestId,
          batchIndex: batchIndex + 1,
          error: serializeError(err),
        });
        throw err;
      }

      const relevantIndexes = parseRelevantIndexes(result.result, batch.length);
      rawParts.push(`Batch ${batchIndex + 1}/${keywordBatches.length}\n${result.result}`);

      for (const index of relevantIndexes) {
        relevantKeywords.push(batch[index]);
      }

      logRelevanceFilter('batch_completed', {
        requestId,
        batchIndex: batchIndex + 1,
        relevantKeywordCount: relevantIndexes.length,
      });
    }

    logRelevanceFilter('request_completed', {
      requestId,
      inputKeywordCount: keywords.length,
      relevantKeywordCount: relevantKeywords.length,
      batchCount: keywordBatches.length,
    });

    return res.json({
      success: true,
      relevant_keywords: relevantKeywords,
      input_keyword_count: keywords.length,
      relevant_keyword_count: relevantKeywords.length,
      batch_count: keywordBatches.length,
      raw: rawParts.join('\n\n'),
    });
  } catch (err) {
    logRelevanceFilter('request_failed', {
      requestId,
      error: serializeError(err),
    });
    console.error('Relevance filter error:', err);
    const status = (err as any).code === 'auth_error' ? 401
      : (err as any).code === 'rate_limit' ? 429
      : 500;
    return res.status(status).json(errorResponse(err));
  }
}
