import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { runAgent, streamAgent, AgentError, generateOnly } from '../services/agent.ts';
import {
  getKeywordGeneratorPrompt,
  getKeywordGroupingGroupsPrompt,
  getKeywordGroupingMergeReviewPrompt,
  getKeywordGroupingPlanPrompt,
  getKeywordGroupingRepairPrompt,
  getKeywordRelevanceFilterPrompt,
  getPaaBlogIdeasPrompt,
  getPaaBlogSeedSelectionPrompt,
  getSeedKeywordPrompt,
} from '../config/prompts.ts';
import { fetchGoogleOrganicSerpFeatures } from '../services/dfsSerp.ts';
import { verifyDashVolumes } from '../services/volumeVerifier.ts';
import { parseAndValidateSeedOutput } from '../../shared/seedKeywords.ts';
import type { KeywordGroupingPlan } from '../../shared/keywordGroupingPlan.ts';
import { mergeKeywordGroupingPlans, parseAndValidateKeywordGroupingPlanOutput } from '../../shared/keywordGroupingPlan.ts';
import {
  buildKeywordMapReference,
  dedupeCollectedEntries,
  filterCannibalizingIdeas,
  normalizePaaText,
  type PaaCollectedEntry,
  type PaaIdeaRow,
  type PaaKeywordMap,
  type PaaSeedPlan,
} from '../../shared/paaBlog.ts';
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
} from '../../shared/keywordGroupingOutput.ts';
import {
  getKeywordGroupingBatchJsonSchema,
  getKeywordGroupingMergeReviewJsonSchema,
  getKeywordGroupingPlanJsonSchema,
  getKeywordRelevanceFilterJsonSchema,
  getPaaBlogIdeasJsonSchema,
  getPaaSeedSelectionJsonSchema,
} from '../../shared/claudeStructuredSchemas.ts';

export const keywordRouter = Router();

type GroupingJobStatus = 'queued' | 'running' | 'completed' | 'failed';

type GroupingJobProgress = {
  phase: 'queued' | 'planning' | 'merging_plan' | 'final_grouping' | 'completed' | 'failed';
  total_plan_batches: number;
  completed_plan_batches: number;
  total_final_batches: number;
  completed_final_batches: number;
  current_batch: number | null;
  input_keyword_count: number;
  message: string | null;
};

type GroupingJobResult = {
  groups: ReturnType<typeof ensureKeywordGroupingCoverage>;
  csv: string;
  group_count: number;
  covered_keyword_count: number;
  input_keyword_count: number;
  batch_count: number;
};

type StoredGroupingJob = {
  job_id: string;
  formData: Record<string, any>;
  keywords: GroupingKeywordInput[];
  status: GroupingJobStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  progress: GroupingJobProgress;
  error: string | null;
  plan: KeywordGroupingPlan | null;
  plan_raw: string | null;
  result: GroupingJobResult | null;
  raw: string | null;
};

const groupingJobs = new Map<string, StoredGroupingJob>();

type PaaBlogJobStatus = 'queued' | 'running' | 'completed' | 'failed';

type PaaBlogJobProgress = {
  phase: 'queued' | 'seed_selection' | 'collecting_thai' | 'collecting_english' | 'finalizing' | 'completed' | 'failed';
  total_serp_calls: number;
  completed_serp_calls: number;
  current_seed: string | null;
  message: string | null;
};

type PaaBlogJobResult = {
  seed_plan: PaaSeedPlan;
  collected_entries: PaaCollectedEntry[];
  ideas: PaaIdeaRow[];
  collected_entry_count: number;
  idea_count: number;
  keyword_map_group_count: number;
};

type StoredPaaBlogJob = {
  job_id: string;
  formData: Record<string, any>;
  keywordMap: PaaKeywordMap | null;
  status: PaaBlogJobStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  progress: PaaBlogJobProgress;
  error: string | null;
  result: PaaBlogJobResult | null;
  raw: string | null;
};

const paaBlogJobs = new Map<string, StoredPaaBlogJob>();

// Build user message from form data
function buildKeywordUserMessage(formData: Record<string, any>): string {
  const parts: string[] = [];

  parts.push(`Business Name: ${formData.businessName || 'N/A'}`);
  parts.push(`Website URL: ${formData.websiteUrl || 'N/A'}`);
  parts.push(`Business Description & Core Offerings: ${formData.businessDescription || 'N/A'}`);
  parts.push(`SEO Goals & Conversion Action: ${formData.seoGoals || 'N/A'}`);

  if (formData.mustRankKeywords?.length) {
    parts.push(`"Must-Rank" Keywords:\n${formData.mustRankKeywords.map((k: string) => `- ${k}`).join('\n')}`);
  }
  if (formData.focusProductLines?.length) {
    parts.push(`Focus Product Lines:\n${formData.focusProductLines.map((p: string) => `- ${p}`).join('\n')}`);
  }

  return parts.join('\n\n');
}

function buildSeedUserMessage(formData: Record<string, any>): string {
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
  return parts.join('\n\n');
}

// Validate form data
function validateFormData(formData: any): string | null {
  if (!formData) return 'formData is required';
  if (!formData.businessName?.trim()) return 'Business name is required';
  if (!formData.businessDescription?.trim()) return 'Business description is required';
  if (!formData.seoGoals?.trim()) return 'SEO goals are required';
  return null;
}

function buildPaaSeedSelectionUserMessage(
  formData: Record<string, any>,
  keywordMap: PaaKeywordMap | null
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
  parts.push(`Keyword Map Summary:\n${buildKeywordMapReference(keywordMap)}`);
  return parts.join('\n\n');
}

function parsePaaSeedPlan(raw: string): PaaSeedPlan {
  const parsed = JSON.parse(extractJsonObject(raw));
  const thaiSeeds: string[] = Array.isArray(parsed?.thai_seeds)
    ? parsed.thai_seeds.map((item: unknown) => normalizePaaText(String(item))).filter(Boolean)
    : [];
  const englishSeeds: string[] = Array.isArray(parsed?.english_seeds)
    ? parsed.english_seeds.map((item: unknown) => normalizePaaText(String(item))).filter(Boolean)
    : [];

  const uniqueThai: string[] = [...new Set(thaiSeeds)];
  const uniqueEnglish: string[] = [...new Set(englishSeeds)];

  if (uniqueThai.length < 10 || uniqueEnglish.length < 10) {
    throw new Error('PAA seed selection did not return 10 Thai and 10 English seeds.');
  }

  return {
    thai_seeds: uniqueThai.slice(0, 10),
    english_seeds: uniqueEnglish.slice(0, 10),
  };
}

function buildPaaIdeasUserMessage(
  formData: Record<string, any>,
  keywordMap: PaaKeywordMap | null,
  seedPlan: PaaSeedPlan,
  collectedEntries: PaaCollectedEntry[]
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
  parts.push(`Thai Seeds:\n${seedPlan.thai_seeds.map((seed) => `- ${seed}`).join('\n')}`);
  parts.push(`English Seeds:\n${seedPlan.english_seeds.map((seed) => `- ${seed}`).join('\n')}`);
  parts.push(`Keyword Map Summary:\n${buildKeywordMapReference(keywordMap)}`);
  parts.push(
    `Collected SERP Entries (${collectedEntries.length}):\n${collectedEntries
      .map((entry) => `- [${entry.source}] [${entry.seed_language}] [${entry.source_seed}] ${entry.query}`)
      .join('\n')}`
  );
  return parts.join('\n\n');
}

function parsePaaIdeaRows(raw: string): PaaIdeaRow[] {
  const parsed = JSON.parse(extractJsonObject(raw));
  const ideas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];

  return ideas
    .map((idea: any) => ({
      blog_title: normalizePaaText(String(idea?.blog_title || '')),
      source: idea?.source === 'PAA' ? 'PAA' : 'Related Search',
      source_seed: normalizePaaText(String(idea?.source_seed || '')),
      programmatic_variables: normalizePaaText(String(idea?.programmatic_variables || '')),
    }))
    .filter((idea: PaaIdeaRow) => idea.blog_title && idea.source_seed);
}

const MAX_GROUPING_PLAN_KEYWORDS_PER_BATCH = 2500;
type GroupingKeywordInput = {
  keyword: string;
  search_volume: number | '-' | null | undefined;
};

type RelevanceKeywordInput = GroupingKeywordInput;

const RELEVANCE_FILTER_BATCH_SIZE = 500;
const RELEVANCE_FILTER_MODEL = process.env.CLAUDE_RELEVANCE_MODEL || 'claude-haiku-4-5';
const MAX_GROUPING_FINAL_KEYWORDS_PER_BATCH = 1000;

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
  keywords: GroupingKeywordInput[]
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
  if (!needsReviewKeywords.length) {
    return groups;
  }

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
  return chunkGroupingPlanKeywords(keywords, MAX_GROUPING_FINAL_KEYWORDS_PER_BATCH).filter(
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

function nowIso() {
  return new Date().toISOString();
}

function serializeGroupingJob(job: StoredGroupingJob) {
  return {
    job_id: job.job_id,
    status: job.status,
    created_at: job.created_at,
    started_at: job.started_at,
    completed_at: job.completed_at,
    progress: job.progress,
    error: job.error,
    plan: job.plan || undefined,
    plan_raw: job.plan_raw,
    result: job.result || undefined,
    raw: job.raw,
  };
}

function serializePaaBlogJob(job: StoredPaaBlogJob) {
  return {
    job_id: job.job_id,
    status: job.status,
    created_at: job.created_at,
    started_at: job.started_at,
    completed_at: job.completed_at,
    progress: job.progress,
    error: job.error,
    result: job.result || undefined,
    raw: job.raw,
  };
}

async function processPaaBlogJob(jobId: string) {
  const job = paaBlogJobs.get(jobId);
  if (!job) return;

  try {
    job.status = 'running';
    job.started_at = nowIso();
    job.progress.phase = 'seed_selection';
    job.progress.message = 'Selecting Thai and English SERP seeds';

    const seedPrompt = getPaaBlogSeedSelectionPrompt();
    const seedUserMessage = buildPaaSeedSelectionUserMessage(job.formData, job.keywordMap);
    const seedResponse = await generateOnly(seedPrompt, seedUserMessage, {
      jsonSchema: getPaaSeedSelectionJsonSchema(),
    });
    const seedPlan = parsePaaSeedPlan(seedResponse.result);

    const rawParts = [`Seed Plan\n${seedResponse.result}`];
    const collectedEntries: PaaCollectedEntry[] = [];
    const allSeeds = [
      ...seedPlan.thai_seeds.map((seed) => ({ keyword: seed, language: 'th' as const })),
      ...seedPlan.english_seeds.map((seed) => ({ keyword: seed, language: 'en' as const })),
    ];

    job.progress.total_serp_calls = allSeeds.length;

    for (let index = 0; index < allSeeds.length; index += 1) {
      const seed = allSeeds[index];
      job.progress.phase = seed.language === 'th' ? 'collecting_thai' : 'collecting_english';
      job.progress.current_seed = seed.keyword;
      job.progress.message = `Collecting ${seed.language === 'th' ? 'Thai' : 'English'} SERP features for "${seed.keyword}"`;

      const features = await fetchGoogleOrganicSerpFeatures(seed.keyword, seed.language);
      rawParts.push(
        `Seed ${index + 1}/${allSeeds.length}: ${seed.keyword}\nPAA: ${features.paaTitles.join(' | ')}\nRelated: ${features.relatedSearches.join(' | ')}`
      );

      for (const title of features.paaTitles) {
        collectedEntries.push({
          query: title,
          source: 'PAA',
          source_seed: seed.keyword,
          seed_language: seed.language,
        });
      }

      for (const query of features.relatedSearches) {
        collectedEntries.push({
          query,
          source: 'Related Search',
          source_seed: seed.keyword,
          seed_language: seed.language,
        });
      }

      job.progress.completed_serp_calls = index + 1;
    }

    const normalizedEntries = dedupeCollectedEntries(collectedEntries);
    job.progress.phase = 'finalizing';
    job.progress.current_seed = null;
    job.progress.message = 'Translating, deduplicating, and building final Thai blog ideas';

    const ideasPrompt = getPaaBlogIdeasPrompt();
    const ideasUserMessage = buildPaaIdeasUserMessage(job.formData, job.keywordMap, seedPlan, normalizedEntries);
    const ideasResponse = await generateOnly(ideasPrompt, ideasUserMessage, {
      jsonSchema: getPaaBlogIdeasJsonSchema(),
    });
    rawParts.push(`Final Ideas\n${ideasResponse.result}`);

    const rawIdeas = parsePaaIdeaRows(ideasResponse.result);
    const filteredIdeas = filterCannibalizingIdeas(rawIdeas, job.keywordMap);

    job.result = {
      seed_plan: seedPlan,
      collected_entries: normalizedEntries,
      ideas: filteredIdeas,
      collected_entry_count: normalizedEntries.length,
      idea_count: filteredIdeas.length,
      keyword_map_group_count: job.keywordMap?.groups.length || 0,
    };
    job.raw = rawParts.join('\n\n');
    job.status = 'completed';
    job.completed_at = nowIso();
    job.progress.phase = 'completed';
    job.progress.message = 'PAA Blog ideation complete';
  } catch (err) {
    console.error('PAA Blog job error:', err);
    job.status = 'failed';
    job.completed_at = nowIso();
    job.error = errorResponse(err).error;
    job.progress.phase = 'failed';
    job.progress.current_seed = null;
    job.progress.message = 'PAA Blog ideation failed';
  }
}

async function processGroupingJob(jobId: string) {
  const job = groupingJobs.get(jobId);
  if (!job) return;

  try {
    job.status = 'running';
    job.started_at = nowIso();
    job.progress.phase = 'planning';
    job.progress.message = 'Preparing keyword grouping plan';

    const planPrompt = getKeywordGroupingPlanPrompt();
    const keywordBatches = chunkGroupingPlanKeywords(job.keywords, MAX_GROUPING_PLAN_KEYWORDS_PER_BATCH);
    const parsedPlans: KeywordGroupingPlan[] = [];
    const planRawParts: string[] = [];
    job.progress.total_plan_batches = keywordBatches.length;

    for (let batchIndex = 0; batchIndex < keywordBatches.length; batchIndex += 1) {
      const batch = keywordBatches[batchIndex];
      job.progress.current_batch = batchIndex + 1;
      job.progress.message = `Planning batch ${batchIndex + 1} of ${keywordBatches.length}`;
      const userMessage = buildGroupingPlanUserMessage(job.formData, batch);
      const result = await generateOnly(planPrompt, userMessage, {
        jsonSchema: getKeywordGroupingPlanJsonSchema(),
      });
      const plan = parseAndValidateKeywordGroupingPlanOutput(result.result);
      parsedPlans.push(plan);
      planRawParts.push(`Batch ${batchIndex + 1}/${keywordBatches.length}\n${result.result}`);
      job.progress.completed_plan_batches = batchIndex + 1;
    }

    job.progress.phase = 'merging_plan';
    job.progress.current_batch = null;
    job.progress.message = 'Merging product lines and pillars';
    const mergedPlan = mergeKeywordGroupingPlans(parsedPlans);
    job.plan = mergedPlan;
    job.plan_raw = planRawParts.join('\n\n');

    const finalPrompt = getKeywordGroupingGroupsPrompt();
    const finalBatches = await buildGroupingFinalBatches(job.keywords);
    job.progress.phase = 'final_grouping';
    job.progress.total_final_batches = finalBatches.length;
    job.progress.completed_final_batches = 0;
    console.log(`[Grouping] Final grouping will use ${finalBatches.length} batches for ${job.keywords.length} keywords`);

    const parsedResults = [];
    const finalRawParts: string[] = [];

    for (let batchIndex = 0; batchIndex < finalBatches.length; batchIndex += 1) {
      const batch = finalBatches[batchIndex];
      job.progress.current_batch = batchIndex + 1;
      job.progress.message = `Grouping batch ${batchIndex + 1} of ${finalBatches.length}`;
      const existingGroupsSummary = buildExistingGroupsSummary(mergeKeywordGroupingBatchResults(parsedResults), mergedPlan);
      const userMessage = buildGroupingFinalUserMessage(job.formData, mergedPlan, batch, existingGroupsSummary);
      const result = await generateOnly(finalPrompt, userMessage, {
        jsonSchema: getKeywordGroupingBatchJsonSchema(),
      });
      let batchResult;

      try {
        batchResult = parseAndValidateKeywordGroupingBatchOutput(result.result, batch, mergedPlan);
      } catch (batchError) {
        console.error(`Grouping final batch ${batchIndex + 1}/${finalBatches.length} parse failed, trying repair pass:`, batchError);
        try {
          batchResult = await repairKeywordGroupingBatch(job.formData, mergedPlan, batch);
        } catch (repairError) {
          console.error(`Grouping final batch ${batchIndex + 1}/${finalBatches.length} repair fallback:`, repairError);
          batchResult = buildFallbackKeywordGroupingBatchResult(batch, `batch-${batchIndex + 1}`);
        }
      }

      batchResult = {
        groups: await maybeRepairNeedsReviewGroups(job.formData, mergedPlan, batchResult.groups),
      };
      parsedResults.push(batchResult);
      finalRawParts.push(`Batch ${batchIndex + 1}/${finalBatches.length}\n${result.result}`);
      job.progress.completed_final_batches = batchIndex + 1;
    }

    let groups = ensureKeywordGroupingCoverage(mergeKeywordGroupingBatchResults(parsedResults), job.keywords);
    groups = await maybeRepairNeedsReviewGroups(job.formData, mergedPlan, groups);
    groups = ensureKeywordGroupingCoverage(groups, job.keywords);
    groups = await maybeMergeSimilarGroups(job.formData, groups);
    groups = ensureKeywordGroupingCoverage(groups, job.keywords);
    const csv = renderKeywordGroupingCsv(groups);
    const coveredKeywordCount = groups.reduce((sum, group) => sum + group.keywords.length, 0);

    job.result = {
      groups,
      csv,
      group_count: groups.length,
      covered_keyword_count: coveredKeywordCount,
      input_keyword_count: job.keywords.length,
      batch_count: finalBatches.length,
    };
    job.raw = finalRawParts.join('\n\n');
    job.status = 'completed';
    job.completed_at = nowIso();
    job.progress.phase = 'completed';
    job.progress.current_batch = null;
    job.progress.message = 'Keyword grouping complete';
  } catch (err) {
    console.error('Grouping job error:', err);
    job.status = 'failed';
    job.completed_at = nowIso();
    job.error = errorResponse(err).error;
    job.progress.phase = 'failed';
    job.progress.current_batch = null;
    job.progress.message = 'Keyword grouping failed';
  }
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

// POST /api/keywords/generate — Non-streaming
keywordRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    const { formData } = req.body;
    const validationError = validateFormData(formData);
    if (validationError) {
      res.status(400).json({ error: validationError, code: 'validation' });
      return;
    }

    const systemPrompt = getKeywordGeneratorPrompt();
    const userMessage = buildKeywordUserMessage(formData);

    const result = await runAgent(systemPrompt, userMessage);
    // Verify "-" volumes against DFS before returning
    result.result = await verifyDashVolumes(result.result);
    res.json(result);
  } catch (err) {
    console.error('Keyword generation error:', err);
    const status = (err as any).code === 'auth_error' ? 401
      : (err as any).code === 'rate_limit' ? 429
      : 500;
    res.status(status).json(errorResponse(err));
  }
});

keywordRouter.post('/seeds', async (req: Request, res: Response) => {
  try {
    const { formData } = req.body;
    const validationError = validateFormData(formData);
    if (validationError) {
      res.status(400).json({ error: validationError, code: 'validation' });
      return;
    }

    const systemPrompt = getSeedKeywordPrompt();
    const userMessage = buildSeedUserMessage(formData);
    const result = await generateOnly(systemPrompt, userMessage, { responseMode: 'text' });
    const seeds = parseAndValidateSeedOutput(result.result);

    res.json({
      success: true,
      seeds,
      raw: result.result,
    });
  } catch (err) {
    console.error('Seed generation error:', err);
    const status = (err as any).code === 'auth_error' ? 401
      : (err as any).code === 'rate_limit' ? 429
      : 500;
    res.status(status).json(errorResponse(err));
  }
});

keywordRouter.post('/grouping-plan', async (req: Request, res: Response) => {
  try {
    const { formData, keywords } = req.body;
    const validationError = validateFormData(formData);
    if (validationError) {
      res.status(400).json({ error: validationError, code: 'validation' });
      return;
    }

    if (!Array.isArray(keywords) || !keywords.length) {
      res.status(400).json({ error: 'keywords are required', code: 'validation' });
      return;
    }

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
    const status = (err as any).code === 'auth_error' ? 401
      : (err as any).code === 'rate_limit' ? 429
      : 500;
    res.status(status).json(errorResponse(err));
  }
});

keywordRouter.post('/grouping-jobs', async (req: Request, res: Response) => {
  try {
    const { formData, keywords } = req.body;
    const validationError = validateFormData(formData);
    if (validationError) {
      res.status(400).json({ error: validationError, code: 'validation' });
      return;
    }

    if (!Array.isArray(keywords) || !keywords.length) {
      res.status(400).json({ error: 'keywords are required', code: 'validation' });
      return;
    }

    const jobId = randomUUID();
    const job: StoredGroupingJob = {
      job_id: jobId,
      formData,
      keywords,
      status: 'queued',
      created_at: nowIso(),
      started_at: null,
      completed_at: null,
      progress: {
        phase: 'queued',
        total_plan_batches: 0,
        completed_plan_batches: 0,
        total_final_batches: 0,
        completed_final_batches: 0,
        current_batch: null,
        input_keyword_count: keywords.length,
        message: 'Waiting to start',
      },
      error: null,
      plan: null,
      plan_raw: null,
      result: null,
      raw: null,
    };

    groupingJobs.set(jobId, job);
    void processGroupingJob(jobId);

    res.json({
      job_id: jobId,
      status: job.status,
    });
  } catch (err) {
    console.error('Grouping job create error:', err);
    const status = (err as any).code === 'auth_error' ? 401
      : (err as any).code === 'rate_limit' ? 429
      : 500;
    res.status(status).json(errorResponse(err));
  }
});

keywordRouter.post('/relevance-filter', async (req: Request, res: Response) => {
  try {
    const { formData, keywords } = req.body;
    const validationError = validateFormData(formData);
    if (validationError) {
      res.status(400).json({ error: validationError, code: 'validation' });
      return;
    }

    if (!Array.isArray(keywords) || !keywords.length) {
      res.status(400).json({ error: 'keywords are required', code: 'validation' });
      return;
    }

    const systemPrompt = getKeywordRelevanceFilterPrompt();
    const keywordBatches = chunkRelevanceKeywords(keywords, RELEVANCE_FILTER_BATCH_SIZE);
    const relevantKeywords: RelevanceKeywordInput[] = [];
    const rawParts: string[] = [];

    for (let batchIndex = 0; batchIndex < keywordBatches.length; batchIndex += 1) {
      const batch = keywordBatches[batchIndex];
      const userMessage = buildKeywordRelevanceUserMessage(formData, batch);
      const result = await generateOnly(systemPrompt, userMessage, {
        model: RELEVANCE_FILTER_MODEL,
        jsonSchema: getKeywordRelevanceFilterJsonSchema(),
      });
      const relevantIndexes = parseRelevantIndexes(result.result, batch.length);
      rawParts.push(`Batch ${batchIndex + 1}/${keywordBatches.length}\n${result.result}`);

      for (const index of relevantIndexes) {
        relevantKeywords.push(batch[index]);
      }
    }

    res.json({
      success: true,
      relevant_keywords: relevantKeywords,
      input_keyword_count: keywords.length,
      relevant_keyword_count: relevantKeywords.length,
      batch_count: keywordBatches.length,
      raw: rawParts.join('\n\n'),
    });
  } catch (err) {
    console.error('Relevance filter error:', err);
    const status = (err as any).code === 'auth_error' ? 401
      : (err as any).code === 'rate_limit' ? 429
      : 500;
    res.status(status).json(errorResponse(err));
  }
});

keywordRouter.post('/paa-blog-jobs', async (req: Request, res: Response) => {
  try {
    const { formData, keywordMap } = req.body;
    const validationError = validateFormData(formData);
    if (validationError) {
      res.status(400).json({ error: validationError, code: 'validation' });
      return;
    }

    if (!keywordMap || !Array.isArray(keywordMap.groups) || !keywordMap.groups.length) {
      res.status(400).json({ error: 'latest keyword grouping output is required', code: 'validation' });
      return;
    }

    const jobId = randomUUID();
    const job: StoredPaaBlogJob = {
      job_id: jobId,
      formData,
      keywordMap: {
        groups: keywordMap.groups.map((group: any) => ({
          product_line: String(group?.product_line || ''),
          pillar: String(group?.pillar || ''),
          keyword_group: String(group?.keyword_group || ''),
          keywords: Array.isArray(group?.keywords)
            ? group.keywords.map((keyword: any) => ({
                keyword: String(keyword?.keyword || ''),
                search_volume:
                  typeof keyword?.search_volume === 'number' || keyword?.search_volume === '-'
                    ? keyword.search_volume
                    : '-',
              }))
            : [],
        })),
      },
      status: 'queued',
      created_at: nowIso(),
      started_at: null,
      completed_at: null,
      progress: {
        phase: 'queued',
        total_serp_calls: 20,
        completed_serp_calls: 0,
        current_seed: null,
        message: 'Waiting to start',
      },
      error: null,
      result: null,
      raw: null,
    };

    paaBlogJobs.set(jobId, job);
    void processPaaBlogJob(jobId);

    res.json({
      job_id: jobId,
      status: job.status,
    });
  } catch (err) {
    console.error('PAA Blog job create error:', err);
    const status = (err as any).code === 'auth_error' ? 401
      : (err as any).code === 'rate_limit' ? 429
      : 500;
    res.status(status).json(errorResponse(err));
  }
});

keywordRouter.get('/paa-blog-jobs/:jobId', async (req: Request, res: Response) => {
  const job = paaBlogJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'PAA Blog job not found', code: 'not_found' });
    return;
  }

  res.json(serializePaaBlogJob(job));
});

keywordRouter.get('/grouping-jobs/:jobId', async (req: Request, res: Response) => {
  const job = groupingJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Grouping job not found', code: 'not_found' });
    return;
  }

  res.json(serializeGroupingJob(job));
});

keywordRouter.post('/grouping-final', async (req: Request, res: Response) => {
  try {
    const { formData, plan, keywords } = req.body;
    const validationError = validateFormData(formData);
    if (validationError) {
      res.status(400).json({ error: validationError, code: 'validation' });
      return;
    }

    if (!plan?.product_lines?.length) {
      res.status(400).json({ error: 'grouping plan is required', code: 'validation' });
      return;
    }

    if (!Array.isArray(keywords) || !keywords.length) {
      res.status(400).json({ error: 'keywords are required', code: 'validation' });
      return;
    }

    const systemPrompt = getKeywordGroupingGroupsPrompt();
    const keywordBatches = await buildGroupingFinalBatches(keywords);
    console.log(`[Grouping] Final grouping will use ${keywordBatches.length} batches for ${keywords.length} keywords`);
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
    const status = (err as any).code === 'auth_error' ? 401
      : (err as any).code === 'rate_limit' ? 429
      : 500;
    res.status(status).json(errorResponse(err));
  }
});

// POST /api/keywords/stream — SSE streaming
keywordRouter.post('/stream', async (req: Request, res: Response) => {
  try {
    const { formData } = req.body;
    const validationError = validateFormData(formData);
    if (validationError) {
      res.status(400).json({ error: validationError, code: 'validation' });
      return;
    }

    const systemPrompt = getKeywordGeneratorPrompt();
    const userMessage = buildKeywordUserMessage(formData);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.flushHeaders();

    // Disable TCP buffering (Nagle's algorithm) so small writes are sent immediately
    res.socket?.setNoDelay(true);
    res.socket?.setTimeout(0);

    // Handle client disconnect
    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
      console.log('[Stream] Client disconnected');
    });

    const send = (data: string) => {
      if (clientDisconnected) return;
      const ok = res.write(data);
      if (typeof (res as any).flush === 'function') (res as any).flush();
      // Log every write to confirm callbacks are firing
      const preview = data.slice(0, 80).replace(/\n/g, '\\n');
      console.log(`[keywords-send] write=${ok} len=${data.length} | ${preview}`);
    };

    // Send initial event immediately to confirm connection is live
    send(`data: ${JSON.stringify({ type: 'status', content: '[Connected to agent...]\n' })}\n\n`);

    await streamAgent(systemPrompt, userMessage, {
      onText: (text) => {
        send(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
      },
      onTool: (toolName) => {
        send(`data: ${JSON.stringify({ type: 'tool', name: toolName })}\n\n`);
      },
      onStatus: (status) => {
        send(`data: ${JSON.stringify({ type: 'status', content: status })}\n\n`);
      },
      onDone: async (result) => {
        if (clientDisconnected) return;
        // Verify "-" volumes against DFS before signaling completion
        try {
          const verified = await verifyDashVolumes(result);
          send(`data: ${JSON.stringify({ type: 'done', result: verified })}\n\n`);
        } catch {
          send(`data: ${JSON.stringify({ type: 'done', result })}\n\n`);
        }
        res.end();
      },
      onError: (error) => {
        send(`data: ${JSON.stringify({ type: 'error', message: error })}\n\n`);
        res.end();
      },
    });
  } catch (err) {
    console.error('Keyword streaming error:', err);
    const errPayload = errorResponse(err);
    if (!res.headersSent) {
      res.status(500).json(errPayload);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: errPayload.error })}\n\n`);
      res.end();
    }
  }
});
