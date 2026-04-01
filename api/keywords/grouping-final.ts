import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AgentError, generateOnly } from '../_lib/agent.js';
import {
  getKeywordGroupingGroupsPrompt,
  getKeywordGroupingMergeReviewPrompt,
  getKeywordGroupingRepairPrompt,
} from '../_lib/prompts.js';
import type { KeywordGroupingPlan } from '../../shared/keywordGroupingPlan.js';
import {
  applyKeywordGroupingMerges,
  buildFallbackKeywordGroupingBatchResult,
  ensureKeywordGroupingCoverage,
  extractNeedsReviewKeywords,
  mergeKeywordGroupingBatchResults,
  mergeRepairGroupsIntoResults,
  parseAndValidateKeywordGroupingBatchOutput,
  renderKeywordGroupingCsv,
  type KeywordGroupingGroup,
  type KeywordGroupingMergeInstruction,
} from '../../shared/keywordGroupingOutput.js';
import {
  getKeywordGroupingBatchJsonSchema,
  getKeywordGroupingMergeReviewJsonSchema,
} from '../../shared/claudeStructuredSchemas.ts';

type GroupingKeywordInput = {
  keyword: string;
  search_volume: number | '-' | null | undefined;
};

const MAX_GROUPING_FINAL_KEYWORDS_PER_BATCH = 1000;

function chunkGroupingKeywords(
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

function buildGroupingFinalUserMessage(
  formData: Record<string, any>,
  plan: KeywordGroupingPlan,
  keywords: GroupingKeywordInput[],
  existingGroupsSummary?: string
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
  parts.push(
    `Approved Grouping Plan IDs:\n${plan.product_lines
      .map(
        (productLine, productLineIndex) =>
          `PL${productLineIndex}: ${productLine.name}\n${productLine.pillars
            .map((pillar, pillarIndex) => `  PI${pillarIndex}: ${pillar.name} (${pillar.intent})`)
            .join('\n')}`
      )
      .join('\n')}`
  );
  parts.push('CRITICAL: use ONLY PL/PI ids from the approved plan. Do not output product line or pillar names.');

  const keywordLines = keywords.map((item, keywordIndex) => {
    const volume = typeof item.search_volume === 'number' ? item.search_volume : '-';
    return `- K${keywordIndex}: ${item.keyword} | ${volume}`;
  });
  parts.push(`Keyword Batch IDs (${keywords.length} keywords):\n${keywordLines.join('\n')}`);
  if (existingGroupsSummary) {
    parts.push(`Existing Groups Summary:\n${existingGroupsSummary}`);
    parts.push('Use this summary to understand what earlier groups already cover. Prefer merging into an existing URL-level intent when one strong page can satisfy the new keywords. Do not create a new group if an existing group already represents the same page intent.');
  }
  parts.push('CRITICAL: output ONLY keyword indexes in the "k" array. Do not output keyword text.');
  return parts.join('\n\n');
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const start = trimmed.indexOf('{');
  if (start < 0) {
    throw new Error('Could not find a valid JSON object in grouping merge review output.');
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

  throw new Error('Could not find a complete JSON object in grouping merge review output.');
}

function buildGroupingRepairUserMessage(
  formData: Record<string, any>,
  plan: KeywordGroupingPlan,
  keywords: GroupingKeywordInput[]
): string {
  return buildGroupingFinalUserMessage(formData, plan, keywords);
}

function buildGroupingMergeReviewUserMessage(
  formData: Record<string, any>,
  groups: KeywordGroupingGroup[]
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

  const groupLines = groups.map((group, groupIndex) => {
    const keywordsPreview = group.keywords
      .slice(0, 12)
      .map((keyword) => `${keyword.keyword} (${typeof keyword.search_volume === 'number' ? keyword.search_volume : '-'})`)
      .join(' | ');
    return `- G${groupIndex}: ${group.keyword_group} | ${group.slug} | ${keywordsPreview}`;
  });
  parts.push(`Groups in same pillar (${groups.length} groups):\n${groupLines.join('\n')}`);
  parts.push('CRITICAL: output ONLY merges for groups that clearly should be the same URL. Use only G indexes.');
  return parts.join('\n\n');
}

function parseMergeReviewOutput(raw: string, groupCount: number): KeywordGroupingMergeInstruction[] {
  const parsed = JSON.parse(extractJsonObject(raw));
  const rawMerges = Array.isArray(parsed?.merges) ? parsed.merges : [];
  const used = new Set<number>();
  const merges: KeywordGroupingMergeInstruction[] = [];

  for (const item of rawMerges) {
    const keep = Number(item?.keep);
    const merge = Array.isArray(item?.merge)
      ? item.merge
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isInteger(value) && value >= 0 && value < groupCount && value !== keep)
      : [];

    if (!Number.isInteger(keep) || keep < 0 || keep >= groupCount) continue;
    if (!merge.length) continue;
    if (used.has(keep) || merge.some((value) => used.has(value))) continue;

    used.add(keep);
    for (const value of merge) used.add(value);
    merges.push({ keep, merge });
  }

  return merges;
}

async function repairKeywordGroupingBatch(
  formData: Record<string, any>,
  plan: KeywordGroupingPlan,
  batch: GroupingKeywordInput[]
) {
  const repairPrompt = getKeywordGroupingRepairPrompt();
  const repairUserMessage = buildGroupingRepairUserMessage(formData, plan, batch);
  const repairResult = await generateOnly(repairPrompt, repairUserMessage, {
    jsonSchema: getKeywordGroupingBatchJsonSchema(),
  });
  return parseAndValidateKeywordGroupingBatchOutput(repairResult.result, batch, plan);
}

async function maybeRepairNeedsReviewGroups(
  formData: Record<string, any>,
  plan: KeywordGroupingPlan,
  groups: KeywordGroupingGroup[]
): Promise<KeywordGroupingGroup[]> {
  const needsReviewKeywords = extractNeedsReviewKeywords(groups);
  if (!needsReviewKeywords.length) return groups;

  try {
    const repaired = await repairKeywordGroupingBatch(formData, plan, needsReviewKeywords);
    return mergeRepairGroupsIntoResults(groups, repaired.groups);
  } catch (repairError) {
    console.error('Grouping repair pass failed:', repairError);
    return groups;
  }
}

async function maybeMergeSimilarGroups(
  formData: Record<string, any>,
  groups: KeywordGroupingGroup[]
): Promise<KeywordGroupingGroup[]> {
  const mergePrompt = getKeywordGroupingMergeReviewPrompt();
  const buckets = new Map<string, { indexes: number[]; groups: KeywordGroupingGroup[] }>();

  groups.forEach((group, index) => {
    const key = `${group.product_line}::${group.pillar}::${group.intent}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.indexes.push(index);
      bucket.groups.push(group);
      return;
    }
    buckets.set(key, { indexes: [index], groups: [group] });
  });

  let workingGroups = [...groups];

  for (const bucket of buckets.values()) {
    if (bucket.groups.length < 2) continue;

    try {
      const userMessage = buildGroupingMergeReviewUserMessage(formData, bucket.groups);
      const result = await generateOnly(mergePrompt, userMessage, {
        jsonSchema: getKeywordGroupingMergeReviewJsonSchema(),
      });
      const localInstructions = parseMergeReviewOutput(result.result, bucket.groups.length);
      if (!localInstructions.length) continue;

      const mappedInstructions = localInstructions.map((instruction) => ({
        keep: bucket.indexes[instruction.keep],
        merge: instruction.merge.map((value) => bucket.indexes[value]),
      }));

      workingGroups = applyKeywordGroupingMerges(workingGroups, mappedInstructions);
    } catch (mergeError) {
      console.error('Grouping merge review failed:', mergeError);
    }
  }

  return workingGroups;
}

async function buildGroupingFinalBatches(
  keywords: GroupingKeywordInput[]
): Promise<GroupingKeywordInput[][]> {
  return chunkGroupingKeywords(keywords, MAX_GROUPING_FINAL_KEYWORDS_PER_BATCH).filter(
    (batch) => batch.length > 0
  );
}

function buildExistingGroupsSummary(groups: KeywordGroupingGroup[], plan: KeywordGroupingPlan): string {
  if (!groups.length) return '';

  const planIndexByScope = new Map<string, { pl: number; pi: number }>();
  plan.product_lines.forEach((productLine, pl) => {
    productLine.pillars.forEach((pillar, pi) => {
      planIndexByScope.set(`${productLine.name}::${pillar.name}`, { pl, pi });
    });
  });

  const lines = groups
    .slice(0, 200)
    .map((group) => {
      const scope = planIndexByScope.get(`${group.product_line}::${group.pillar}`);
      if (!scope) return null;
      const keywordPreview = group.keywords
        .slice(0, 5)
        .map((keyword) => keyword.keyword)
        .join(' | ');
      return `- PL${scope.pl}/PI${scope.pi}: ${group.keyword_group} | ${group.slug} | ${keywordPreview}`;
    })
    .filter(Boolean) as string[];

  return lines.join('\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { formData, plan, keywords } = req.body;
    if (!formData?.businessName?.trim()) return res.status(400).json({ error: 'Business name is required', code: 'validation' });
    if (!formData?.businessDescription?.trim()) return res.status(400).json({ error: 'Business description is required', code: 'validation' });
    if (!formData?.seoGoals?.trim()) return res.status(400).json({ error: 'SEO goals are required', code: 'validation' });
    if (!plan?.product_lines?.length) return res.status(400).json({ error: 'grouping plan is required', code: 'validation' });
    if (!Array.isArray(keywords) || !keywords.length) return res.status(400).json({ error: 'keywords are required', code: 'validation' });

    const systemPrompt = getKeywordGroupingGroupsPrompt();
    const keywordBatches = await buildGroupingFinalBatches(keywords);
    const parsedResults = [];
    const rawParts: string[] = [];

    for (let batchIndex = 0; batchIndex < keywordBatches.length; batchIndex += 1) {
      const batch = keywordBatches[batchIndex];
      const existingGroupsSummary = buildExistingGroupsSummary(mergeKeywordGroupingBatchResults(parsedResults), plan);
      const userMessage = buildGroupingFinalUserMessage(formData, plan, batch, existingGroupsSummary);
      const result = await generateOnly(systemPrompt, userMessage, {
        jsonSchema: getKeywordGroupingBatchJsonSchema(),
      });
      let batchResult;

      try {
        batchResult = parseAndValidateKeywordGroupingBatchOutput(result.result, batch, plan);
      } catch (batchError) {
        console.error(`Grouping final batch ${batchIndex + 1}/${keywordBatches.length} parse failed, trying repair pass:`, batchError);
        try {
          batchResult = await repairKeywordGroupingBatch(formData, plan, batch);
        } catch (repairError) {
          console.error(`Grouping final batch ${batchIndex + 1}/${keywordBatches.length} repair fallback:`, repairError);
          batchResult = buildFallbackKeywordGroupingBatchResult(batch, `batch-${batchIndex + 1}`);
        }
      }

      batchResult = {
        groups: await maybeRepairNeedsReviewGroups(formData, plan, batchResult.groups),
      };
      parsedResults.push(batchResult);
      rawParts.push(`Batch ${batchIndex + 1}/${keywordBatches.length}\n${result.result}`);
    }

    let groups = ensureKeywordGroupingCoverage(mergeKeywordGroupingBatchResults(parsedResults), keywords);
    groups = await maybeRepairNeedsReviewGroups(formData, plan, groups);
    groups = ensureKeywordGroupingCoverage(groups, keywords);
    groups = await maybeMergeSimilarGroups(formData, groups);
    groups = ensureKeywordGroupingCoverage(groups, keywords);
    const raw = rawParts.join('\n\n');
    const batchCount = keywordBatches.length;

    const csv = renderKeywordGroupingCsv(groups);
    const coveredKeywordCount = groups.reduce((sum, group) => sum + group.keywords.length, 0);

    res.json({
      success: true,
      result: {
        groups,
        csv,
        group_count: groups.length,
        covered_keyword_count: coveredKeywordCount,
        input_keyword_count: keywords.length,
        batch_count: batchCount,
      },
      raw,
    });
  } catch (err) {
    console.error('Grouping final error:', err);
    const status = (err as any).code === 'auth_error' ? 401 : (err as any).code === 'rate_limit' ? 429 : 500;
    if (err instanceof AgentError) {
      res.status(status).json({ error: err.userMessage, code: err.code, retryable: err.retryable });
    } else {
      res.status(500).json({ error: (err as Error).message, code: 'unknown', retryable: false });
    }
  }
}
