import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runAgent, streamAgent, AgentError, generateOnly } from '../services/agent.ts';
import {
  generateOnlyWithGemini,
  getKeywordGroupingPreviewModelSelection,
} from '../services/geminiText.ts';
import { embedTextsWithGemini, isGeminiEmbeddingsEnabled } from '../services/geminiEmbeddings.ts';
import {
  getKeywordGroupingBlueprintPrompt,
  getKeywordGroupingPreviewAssignmentPrompt,
  getKeywordGeneratorPrompt,
  getKeywordGroupingPlanPrompt,
  getKeywordRelevanceFilterPrompt,
  getPaaBlogIdeasPrompt,
  getPaaBlogSeedSelectionPrompt,
  getSeedKeywordPrompt,
} from '../config/prompts.ts';
import { fetchGoogleOrganicSerpFeatures } from '../services/dfsSerp.ts';
import { verifyDashVolumes } from '../services/volumeVerifier.ts';
import { parseAndValidateSeedOutput } from '../../shared/seedKeywords.ts';
import type { KeywordGroupingPlan, PillarIntent } from '../../shared/keywordGroupingPlan.ts';
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
  ensureKeywordGroupingCoverage,
  renderKeywordGroupingCsv,
  type KeywordGroupingGroup,
} from '../../shared/keywordGroupingOutput.ts';
import {
  getKeywordGroupingBlueprintJsonSchema,
  getKeywordGroupingPreviewAssignmentJsonSchema,
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
  preview_only: boolean;
  groups: ReturnType<typeof ensureKeywordGroupingCoverage>;
  csv: string;
  group_count: number;
  covered_keyword_count: number;
  input_keyword_count: number;
  batch_count: number;
};

type StoredGroupingJob = {
  job_id: string;
  preview_only: boolean;
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
const MAX_PREVIEW_ASSIGNMENT_KEYWORDS_PER_BATCH = 100;
const MAX_PREVIEW_ASSIGNMENT_ROUNDS = 2;
const PREVIEW_ASSIGNMENT_TEMPERATURES = [0.2, 0.5];
const PREVIEW_ASSIGNMENT_EMBEDDING_THRESHOLD = 0.9;
const PREVIEW_ASSIGNMENT_EMBEDDING_ENABLED =
  (process.env.KEYWORD_GROUPING_ENABLE_EMBEDDING_LEFTOVER_ASSIGNMENT || 'false').trim().toLowerCase() === 'true';
const BLUEPRINT_NOISE_PATTERN =
  /(wallpaper|background|photo|photography|image|images|png|jpg|jpeg|gif|vector|clipart|3d warehouse|3d model|cad\b|dwg\b|sketchup|free download|template|mockup)/i;
const BLUEPRINT_LOW_VALUE_GROUP_PATTERN =
  /(\bgeneral\b|\bideas\b|\bindex\b|wallpaper|background|photo|photography|image|images|3d warehouse|3d model|free download|template|mockup)/i;

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

function buildGroupingBlueprintUserMessage(
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
    parts.push(`Suggested Focus Areas:\n${formData.focusProductLines.map((p: string) => `- ${p}`).join('\n')}`);
  }
  parts.push('Target Market: Thailand');
  parts.push('Naming Rule: Prefer Thai market naming by default. Use English only when the demand is clearly English-led or the English term is commonly used in Thailand as-is.');
  parts.push('Preview Goal: identify reusable SEO topic URLs from real search demand, guided by business scope and SEO objectives.');
  const keywordLines = keywords.map((item) => {
    const volume = typeof item.search_volume === 'number' ? item.search_volume : '-';
    return `- ${item.keyword} | ${volume}`;
  });
  parts.push(`Keyword Demand Landscape (${keywords.length} keywords):\n${keywordLines.join('\n')}`);

  return parts.join('\n\n');
}

function buildGroupingBlueprintKeywords(keywords: GroupingKeywordInput[]): GroupingKeywordInput[] {
  return [...keywords]
    .filter((keyword) => !isBlueprintNoiseKeyword(keyword.keyword))
    .sort((a, b) => {
      const aVolume = typeof a.search_volume === 'number' ? a.search_volume : -1;
      const bVolume = typeof b.search_volume === 'number' ? b.search_volume : -1;
      if (bVolume !== aVolume) return bVolume - aVolume;
      return a.keyword.localeCompare(b.keyword);
    });
}

async function generateGroupingBlueprint(
  formData: Record<string, any>,
  keywords: GroupingKeywordInput[]
): Promise<{ groups: KeywordGroupingGroup[]; raw: string }> {
  const blueprintPrompt = getKeywordGroupingBlueprintPrompt();
  const blueprintKeywords = buildGroupingBlueprintKeywords(keywords);
  const userMessage = buildGroupingBlueprintUserMessage(formData, blueprintKeywords);
  const previewModel = getKeywordGroupingPreviewModelSelection();
  const previewTemperature = 1;
  const debugDir = path.join('/tmp', 'martech-seo-debug');
  fs.mkdirSync(debugDir, { recursive: true });
  const builderDebugPath = path.join(debugDir, 'preview-group-builder-last-request.json');
  const builderResponseDebugPath = path.join(debugDir, 'preview-group-builder-last-response.json');
  fs.writeFileSync(
    builderDebugPath,
    JSON.stringify(
      {
        stage: 'builder',
        provider: previewModel.provider,
        model: previewModel.model,
        temperature: previewTemperature,
        business_context_included: true,
        keyword_count: blueprintKeywords.length,
        system_prompt: blueprintPrompt,
        user_message: userMessage,
      },
      null,
      2
    ),
    'utf-8'
  );
  const builderResult =
    previewModel.provider === 'gemini'
      ? await generateOnlyWithGemini(blueprintPrompt, userMessage, {
          model: previewModel.model,
          jsonSchema: getKeywordGroupingBlueprintJsonSchema(),
          temperature: previewTemperature,
        })
      : await generateOnly(blueprintPrompt, userMessage, {
          model: previewModel.model,
          jsonSchema: getKeywordGroupingBlueprintJsonSchema(),
        });
  fs.writeFileSync(
    builderResponseDebugPath,
    JSON.stringify(
      {
        stage: 'builder',
        provider: previewModel.provider,
        model: previewModel.model,
        temperature: previewTemperature,
        business_context_included: true,
        raw_result: builderResult.result,
      },
      null,
      2
    ),
    'utf-8'
  );
  const groups = buildPreviewGroupsFromBlueprint(builderResult.result);

  return {
    groups,
    raw:
      `provider=${previewModel.provider}\n` +
      `model=${previewModel.model}\n` +
      `temperature=${previewTemperature}\n` +
      `business_context_included=true\n` +
      `planning_keyword_count=${blueprintKeywords.length}\n` +
      `draft_group_count=${groups.length}\n` +
      `builder_debug_file=${builderDebugPath}\n` +
      `builder_response_debug_file=${builderResponseDebugPath}\n\n` +
      `Blueprint\n${builderResult.result}`,
  };
}

function buildPreviewGroupsFromBlueprint(
  raw: string,
  options?: {
    skipPostProcessing?: boolean;
  }
): KeywordGroupingGroup[] {
  const parsed = JSON.parse(extractJsonObject(raw));
  const rawGroups = Array.isArray(parsed?.groups) ? parsed.groups : [];
  const usedSlugs = new Set<string>();
  const usedNames = new Set<string>();
  const skipPostProcessing = options?.skipPostProcessing === true;
  const nextGroups: Array<KeywordGroupingGroup | null> = rawGroups.map((group: any) => {
      const productLine = String(group?.product_line || '').trim();
      const pillar = String(group?.topic_pillar || '').trim();
      const intent = String(group?.intent || '').trim().toUpperCase() as PillarIntent;
      const keywordGroup = String(group?.keyword_group || '').trim();
      const slug = String(group?.slug || '').trim();

      if (!productLine || !pillar || !keywordGroup || !slug) return null;
      if (!['T', 'C', 'I', 'N'].includes(intent)) return null;
      let normalizedSlug = slug.startsWith('/') ? slug : `/${slug}`;
      if (!normalizedSlug.endsWith('/')) normalizedSlug = `${normalizedSlug}/`;
      let uniqueSlug = normalizedSlug;

      if (!skipPostProcessing) {
        if (isBlueprintNoiseGroup(keywordGroup, slug)) return null;
        const nameKey = `${productLine.toLowerCase()}::${pillar.toLowerCase()}::${keywordGroup.toLowerCase()}`;
        if (usedNames.has(nameKey)) return null;

        const baseSlug = normalizedSlug.replace(/\/+$/, '') || '/group';
        uniqueSlug = `${baseSlug}/`;
        let suffix = 2;
        while (usedSlugs.has(uniqueSlug)) {
          uniqueSlug = `${baseSlug}-${suffix}/`;
          suffix += 1;
        }
        usedNames.add(nameKey);
      }

      usedSlugs.add(uniqueSlug);

      return {
        product_line: productLine,
        pillar,
        intent,
        keyword_group: keywordGroup,
        slug: uniqueSlug,
        keywords: [],
      } satisfies KeywordGroupingGroup;
    });

  return nextGroups.filter((group): group is KeywordGroupingGroup => group !== null);
}

function buildPreviewAssignmentUserMessage(
  _formData: Record<string, any>,
  groups: KeywordGroupingGroup[],
  keywords: GroupingKeywordInput[],
  options?: {
    passLabel?: string;
    assignmentInstruction?: string;
  }
): string {
  const parts: string[] = [];
  parts.push('Target Market: Thailand');
  parts.push(
    `Approved Preview Groups (${groups.length}):\n${groups
      .map((group, index) => {
        const sampleKeywords = group.keywords.slice(0, 10).map((keyword) => keyword.keyword).filter(Boolean);
        const sampleSuffix = sampleKeywords.length ? ` | sample keywords: ${sampleKeywords.join(' ; ')}` : '';
        return `- G${index}: ${group.product_line} | ${group.pillar} | ${group.intent} | ${group.keyword_group} | ${group.slug}${sampleSuffix}`;
      })
      .join('\n')}`
  );
  parts.push(
    `Keyword Batch (${keywords.length}):\n${keywords
      .map((keyword, index) => `- K${index}: ${keyword.keyword} | ${typeof keyword.search_volume === 'number' ? keyword.search_volume : '-'}`)
      .join('\n')}`
  );
  if (options?.passLabel?.trim()) {
    parts.push(`Assignment Pass: ${options.passLabel.trim()}`);
  }
  parts.push(
    options?.assignmentInstruction?.trim()
      || 'Assign each keyword to the single best existing group when there is one reasonable page-fit. Leave it unassigned only when no approved group is a reasonable fit.'
  );

  return parts.join('\n\n');
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const aValue = a[index] || 0;
    const bValue = b[index] || 0;
    dot += aValue * bValue;
    normA += aValue * aValue;
    normB += bValue * bValue;
  }

  if (!normA || !normB) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildPreviewGroupEmbeddingDescriptors(groups: KeywordGroupingGroup[]): string[] {
  return groups.map((group) => {
    const sampleKeywords = group.keywords.slice(0, 10).map((keyword) => keyword.keyword).filter(Boolean);
    return [
      `product line: ${group.product_line}`,
      `pillar: ${group.pillar}`,
      `intent: ${group.intent}`,
      `keyword group: ${group.keyword_group}`,
      `slug: ${group.slug}`,
      sampleKeywords.length ? `sample keywords: ${sampleKeywords.join(' ; ')}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
  });
}

function parsePreviewAssignmentOutput(
  raw: string,
  groups: KeywordGroupingGroup[],
  keywords: GroupingKeywordInput[]
): KeywordGroupingGroup[] {
  const parsed = JSON.parse(extractJsonObject(raw));
  const assignments = Array.isArray(parsed?.assignments) ? parsed.assignments : [];
  const nextGroups: KeywordGroupingGroup[] = groups.map((group) => ({
    ...group,
    keywords: [...group.keywords],
  }));
  const assignedKeywordIndexes = new Set<number>();

  for (const item of assignments) {
    const groupIndex = Number(item?.g);
    const keywordIndexes = Array.isArray(item?.k)
      ? item.k
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isInteger(value) && value >= 0 && value < keywords.length)
      : [];

    if (!Number.isInteger(groupIndex) || groupIndex < 0 || groupIndex >= nextGroups.length) continue;

    for (const keywordIndex of keywordIndexes) {
      if (assignedKeywordIndexes.has(keywordIndex)) continue;
      assignedKeywordIndexes.add(keywordIndex);
      const keyword = keywords[keywordIndex];
      if (!keyword?.keyword?.trim()) continue;
      nextGroups[groupIndex].keywords.push({
        keyword: keyword.keyword.trim(),
        search_volume: typeof keyword.search_volume === 'number' ? keyword.search_volume : '-',
      });
    }
  }

  return nextGroups;
}

async function assignKeywordsToPreviewGroups(
  formData: Record<string, any>,
  groups: KeywordGroupingGroup[],
  keywords: GroupingKeywordInput[]
): Promise<{ groups: KeywordGroupingGroup[]; raw: string }> {
  const assignmentPrompt = getKeywordGroupingPreviewAssignmentPrompt();
  const previewModel: ReturnType<typeof getKeywordGroupingPreviewModelSelection> = {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
  };
  let assignedGroups: KeywordGroupingGroup[] = groups.map((group) => ({
    ...group,
    keywords: [],
  }));
  const debugDir = path.join('/tmp', 'martech-seo-debug');
  fs.mkdirSync(debugDir, { recursive: true });
  const assignmentDebugPath = path.join(debugDir, 'preview-group-assignment-last-request.json');
  const assignmentResponseDebugPath = path.join(debugDir, 'preview-group-assignment-last-response.json');
  const rawParts: string[] = [
    `assignment_provider=${previewModel.provider}`,
    `assignment_model=${previewModel.model}`,
    `assignment_temperatures=${PREVIEW_ASSIGNMENT_TEMPERATURES.join(',')}`,
    `assignment_max_rounds=${MAX_PREVIEW_ASSIGNMENT_ROUNDS}`,
    `assignment_debug_file=${assignmentDebugPath}`,
    `assignment_response_debug_file=${assignmentResponseDebugPath}`,
  ];
  const requestLog: Array<Record<string, unknown>> = [];
  const responseLog: Array<Record<string, unknown>> = [];

  const runAssignmentPass = async (
    sourceKeywords: GroupingKeywordInput[],
    passLabel: string,
    assignmentInstruction: string,
    assignmentTemperature: number
  ) => {
    for (let index = 0; index < sourceKeywords.length; index += MAX_PREVIEW_ASSIGNMENT_KEYWORDS_PER_BATCH) {
      const keywordBatch = sourceKeywords.slice(index, index + MAX_PREVIEW_ASSIGNMENT_KEYWORDS_PER_BATCH);
      const userMessage = buildPreviewAssignmentUserMessage(formData, assignedGroups, keywordBatch, {
        passLabel,
        assignmentInstruction,
      });
      requestLog.push({
        pass: passLabel,
        batch: Math.floor(index / MAX_PREVIEW_ASSIGNMENT_KEYWORDS_PER_BATCH) + 1,
        provider: previewModel.provider,
        model: previewModel.model,
        temperature: assignmentTemperature,
        keyword_count: keywordBatch.length,
        system_prompt: assignmentPrompt,
        user_message: userMessage,
      });
      const result =
        previewModel.provider === 'gemini'
          ? await generateOnlyWithGemini(assignmentPrompt, userMessage, {
              model: previewModel.model,
              jsonSchema: getKeywordGroupingPreviewAssignmentJsonSchema(),
              temperature: assignmentTemperature,
            })
          : await generateOnly(assignmentPrompt, userMessage, {
              model: previewModel.model,
              jsonSchema: getKeywordGroupingPreviewAssignmentJsonSchema(),
            });

      responseLog.push({
        pass: passLabel,
        batch: Math.floor(index / MAX_PREVIEW_ASSIGNMENT_KEYWORDS_PER_BATCH) + 1,
        provider: previewModel.provider,
        model: previewModel.model,
        temperature: assignmentTemperature,
        raw_result: result.result,
      });
      assignedGroups = parsePreviewAssignmentOutput(result.result, assignedGroups, keywordBatch);
      rawParts.push(`${passLabel} Batch ${Math.floor(index / MAX_PREVIEW_ASSIGNMENT_KEYWORDS_PER_BATCH) + 1}\n${result.result}`);
    }
  };

  const getAssignedKeywordSet = (currentGroups: KeywordGroupingGroup[]): Set<string> => {
    const assigned = new Set<string>();
    for (const group of currentGroups) {
      for (const keyword of group.keywords) {
        const normalizedKeyword = keyword.keyword.trim().toLowerCase();
        if (normalizedKeyword) assigned.add(normalizedKeyword);
      }
    }
    return assigned;
  };

  const initialAssignmentTemperature = PREVIEW_ASSIGNMENT_TEMPERATURES[0];
  await runAssignmentPass(
    keywords,
    'Assignment Pass 1',
    'Assign each keyword to the most sensible existing group when there is a clear page-fit. Broad head terms should not go into niche pages unless the fit is very strong. Do not force keywords into a group just because they share words. Variant pages like wattage, subtype, feature, price, or installation should only receive keywords that clearly express that page purpose. If a keyword could fit several different page purposes, prefer leaving it unassigned. Leave it unassigned when the keyword is mainly retailer-led, competitor-led, documentation-led, image/asset-led, or otherwise a poor page match for the approved groups.',
    initialAssignmentTemperature
  );

  let assignedKeywordSet = getAssignedKeywordSet(assignedGroups);
  let remainingKeywords = keywords.filter(
    (keyword) => !assignedKeywordSet.has(keyword.keyword.trim().toLowerCase())
  );

  rawParts.push(
    `Assignment Pass 1 Summary\ntemperature=${initialAssignmentTemperature}\nremaining_before=${keywords.length}\nremaining_after=${remainingKeywords.length}`
  );

  let previousRemainingCount = remainingKeywords.length;

  for (let round = 2; round <= MAX_PREVIEW_ASSIGNMENT_ROUNDS; round += 1) {
    if (!remainingKeywords.length) break;
    const assignmentTemperature =
      PREVIEW_ASSIGNMENT_TEMPERATURES[Math.min(round - 1, PREVIEW_ASSIGNMENT_TEMPERATURES.length - 1)];

    await runAssignmentPass(
      remainingKeywords,
      `Ungrouped Recheck Pass ${round - 1}`,
      'These keywords are the leftovers after the full initial assignment pass. Re-check them using the approved groups plus the sample assigned keywords now visible in each group. Assign them only when one group is the clear practical home. Broad head terms should not go into niche pages unless the fit is very strong. Variant pages like wattage, subtype, feature, price, or installation should only receive keywords that clearly express that page purpose. Do not force mixed-intent, retailer, competitor, documentation, image, or poor-fit keywords into a group just to reduce leftovers.',
      assignmentTemperature
    );

    assignedKeywordSet = getAssignedKeywordSet(assignedGroups);
    const nextRemainingKeywords = keywords.filter(
      (keyword) => !assignedKeywordSet.has(keyword.keyword.trim().toLowerCase())
    );

    rawParts.push(
      `Ungrouped Recheck Pass ${round - 1} Summary\ntemperature=${assignmentTemperature}\nremaining_before=${remainingKeywords.length}\nremaining_after=${nextRemainingKeywords.length}`
    );

    if (nextRemainingKeywords.length >= previousRemainingCount) {
      remainingKeywords = nextRemainingKeywords;
      break;
    }

    previousRemainingCount = nextRemainingKeywords.length;
    remainingKeywords = nextRemainingKeywords;
  }

  fs.writeFileSync(assignmentDebugPath, JSON.stringify(requestLog, null, 2), 'utf-8');
  fs.writeFileSync(assignmentResponseDebugPath, JSON.stringify(responseLog, null, 2), 'utf-8');

  if (remainingKeywords.length && PREVIEW_ASSIGNMENT_EMBEDDING_ENABLED && isGeminiEmbeddingsEnabled()) {
    const groupDescriptors = buildPreviewGroupEmbeddingDescriptors(assignedGroups);
    const [keywordEmbeddings, groupEmbeddings] = await Promise.all([
      embedTextsWithGemini(remainingKeywords.map((keyword) => keyword.keyword)),
      embedTextsWithGemini(groupDescriptors),
    ]);

    let embeddingAssignedCount = 0;

    for (let keywordIndex = 0; keywordIndex < remainingKeywords.length; keywordIndex += 1) {
      const keywordVector = keywordEmbeddings[keywordIndex];
      let bestGroupIndex = -1;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (let groupIndex = 0; groupIndex < groupEmbeddings.length; groupIndex += 1) {
        const score = cosineSimilarity(keywordVector, groupEmbeddings[groupIndex]);
        if (score > bestScore) {
          bestScore = score;
          bestGroupIndex = groupIndex;
        }
      }

      if (bestGroupIndex < 0 || bestScore <= PREVIEW_ASSIGNMENT_EMBEDDING_THRESHOLD) continue;

      const keyword = remainingKeywords[keywordIndex];
      assignedGroups[bestGroupIndex].keywords.push({
        keyword: keyword.keyword.trim(),
        search_volume: typeof keyword.search_volume === 'number' ? keyword.search_volume : '-',
      });
      embeddingAssignedCount += 1;
    }

    rawParts.push(
      `Embedding Leftover Pass\nstatus=enabled\nthreshold=${PREVIEW_ASSIGNMENT_EMBEDDING_THRESHOLD}\nremaining_before=${remainingKeywords.length}\nassigned=${embeddingAssignedCount}\nremaining_after=${remainingKeywords.length - embeddingAssignedCount}`
    );
  } else if (remainingKeywords.length) {
    rawParts.push(
      `Embedding Leftover Pass\nstatus=disabled\nremaining_before=${remainingKeywords.length}`
    );
  }

  return {
    groups: ensureKeywordGroupingCoverage(assignedGroups, keywords),
    raw: rawParts.join('\n\n'),
  };
}

async function runUnifiedGroupingWorkflow(
  formData: Record<string, any>,
  keywords: GroupingKeywordInput[]
): Promise<{ groups: KeywordGroupingGroup[]; raw: string; batchCount: number }> {
  const blueprintResult = await generateGroupingBlueprint(formData, keywords);
  const assignmentResult = await assignKeywordsToPreviewGroups(formData, blueprintResult.groups, keywords);

  return {
    groups: assignmentResult.groups,
    raw: `${blueprintResult.raw}\n\n${assignmentResult.raw}`,
    batchCount: 1,
  };
}

function isBlueprintNoiseKeyword(keyword: string): boolean {
  return BLUEPRINT_NOISE_PATTERN.test(keyword);
}

function isBlueprintNoiseGroup(keywordGroup: string, slug: string): boolean {
  return BLUEPRINT_LOW_VALUE_GROUP_PATTERN.test(keywordGroup) || BLUEPRINT_LOW_VALUE_GROUP_PATTERN.test(slug);
}

function nowIso() {
  return new Date().toISOString();
}

function serializeGroupingJob(job: StoredGroupingJob) {
  return {
    job_id: job.job_id,
    preview_only: job.preview_only,
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
    job.progress.phase = 'final_grouping';
    job.progress.total_plan_batches = 0;
    job.progress.completed_plan_batches = 0;
    job.progress.total_final_batches = 1;
    job.progress.completed_final_batches = 0;
    job.progress.current_batch = 1;
    job.progress.message = job.preview_only
      ? 'Generating candidate keyword groups'
      : 'Generating keyword groups';

    const unifiedResult = await runUnifiedGroupingWorkflow(job.formData, job.keywords);
    const groups = unifiedResult.groups;
    const raw = unifiedResult.raw;
    const batchCount = unifiedResult.batchCount;
    job.plan = null;
    job.plan_raw = null;
    job.progress.completed_final_batches = 1;

    const csv = renderKeywordGroupingCsv(groups);
    const coveredKeywordCount = groups.reduce((sum, group) => sum + group.keywords.length, 0);

    job.result = {
      preview_only: job.preview_only,
      groups,
      csv,
      group_count: groups.length,
      covered_keyword_count: coveredKeywordCount,
      input_keyword_count: job.keywords.length,
      batch_count: batchCount,
    };
    job.raw = raw;
    job.status = 'completed';
    job.completed_at = nowIso();
    job.progress.phase = 'completed';
    job.progress.current_batch = null;
    job.progress.message = job.preview_only ? 'Keyword groups preview complete' : 'Keyword grouping complete';
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
    const { formData, keywords, previewOnly } = req.body;
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
      preview_only: Boolean(previewOnly),
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
      preview_only: job.preview_only,
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
    const unifiedResult = await runUnifiedGroupingWorkflow(formData, keywords);
    const groups = unifiedResult.groups;
    const raw = unifiedResult.raw;
    const batchCount = unifiedResult.batchCount;
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
