import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AgentError, generateOnly } from '../_lib/agent.js';
import { getKeywordGroupingPlanPrompt } from '../_lib/prompts.js';
import { mergeKeywordGroupingPlans, parseAndValidateKeywordGroupingPlanOutput } from '../../shared/keywordGroupingPlan.js';
import { getKeywordGroupingPlanJsonSchema } from '../../shared/claudeStructuredSchemas.ts';

const MAX_GROUPING_PLAN_KEYWORDS_PER_BATCH = 2500;

type GroupingKeywordInput = {
  keyword: string;
  search_volume: number | '-' | null | undefined;
};

function chunkGroupingPlanKeywords(
  keywords: GroupingKeywordInput[],
  chunkSize: number
): GroupingKeywordInput[][] {
  const sorted = [...keywords].sort((a, b) => {
    const aVolume = typeof a.search_volume === 'number' ? a.search_volume : -1;
    const bVolume = typeof b.search_volume === 'number' ? b.search_volume : -1;
    if (bVolume !== aVolume) return bVolume - aVolume;
    return a.keyword.localeCompare(b.keyword);
  });

  const chunks: GroupingKeywordInput[][] = [];
  for (let index = 0; index < sorted.length; index += chunkSize) {
    chunks.push(sorted.slice(index, index + chunkSize));
  }
  return chunks;
}

function buildGroupingPlanUserMessage(
  formData: Record<string, any>,
  keywords: Array<{ keyword: string; search_volume: number | '-' | null | undefined }>
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

  const keywordLines = keywords.map((item) => {
    const volume = typeof item.search_volume === 'number' ? item.search_volume : '-';
    return `- ${item.keyword} | ${volume}`;
  });
  parts.push(`Keyword Pool (${keywords.length} keywords):\n${keywordLines.join('\n')}`);
  return parts.join('\n\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { formData, keywords } = req.body;
    if (!formData?.businessName?.trim()) return res.status(400).json({ error: 'Business name is required', code: 'validation' });
    if (!formData?.businessDescription?.trim()) return res.status(400).json({ error: 'Business description is required', code: 'validation' });
    if (!formData?.seoGoals?.trim()) return res.status(400).json({ error: 'SEO goals are required', code: 'validation' });
    if (!Array.isArray(keywords) || !keywords.length) return res.status(400).json({ error: 'keywords are required', code: 'validation' });

    const systemPrompt = getKeywordGroupingPlanPrompt();
    const keywordBatches = chunkGroupingPlanKeywords(keywords, MAX_GROUPING_PLAN_KEYWORDS_PER_BATCH);
    const parsedPlans = [];
    const rawParts: string[] = [];

    for (let batchIndex = 0; batchIndex < keywordBatches.length; batchIndex += 1) {
      const batch = keywordBatches[batchIndex];
      const userMessage = buildGroupingPlanUserMessage(formData, batch);
      const result = await generateOnly(systemPrompt, userMessage, {
        jsonSchema: getKeywordGroupingPlanJsonSchema(),
      });
      const plan = parseAndValidateKeywordGroupingPlanOutput(result.result);
      parsedPlans.push(plan);
      rawParts.push(`Batch ${batchIndex + 1}/${keywordBatches.length}\n${result.result}`);
    }

    const plan = mergeKeywordGroupingPlans(parsedPlans);

    res.json({
      success: true,
      plan,
      raw: rawParts.join('\n\n'),
      input_keyword_count: keywords.length,
      used_keyword_count: keywords.length,
      truncated: false,
      batch_count: keywordBatches.length,
    });
  } catch (err) {
    console.error('Grouping plan error:', err);
    const status = (err as any).code === 'auth_error' ? 401 : (err as any).code === 'rate_limit' ? 429 : 500;
    if (err instanceof AgentError) {
      res.status(status).json({ error: err.userMessage, code: err.code, retryable: err.retryable });
    } else {
      res.status(500).json({ error: (err as Error).message, code: 'unknown', retryable: false });
    }
  }
}
