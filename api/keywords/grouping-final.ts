import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AgentError, generateOnly } from '../_lib/agent.js';
import { embedTextsWithGemini, isGeminiEmbeddingsEnabled } from '../_lib/geminiEmbeddings.ts';
import {
  getKeywordGroupingBlueprintPrompt,
  getKeywordGroupingPreviewAssignmentPrompt,
} from '../_lib/prompts.js';
import type { PillarIntent } from '../../shared/keywordGroupingPlan.js';
import {
  ensureKeywordGroupingCoverage,
  renderKeywordGroupingCsv,
  type KeywordGroupingGroup,
} from '../../shared/keywordGroupingOutput.js';
import {
  getKeywordGroupingBlueprintJsonSchema,
  getKeywordGroupingPreviewAssignmentJsonSchema,
} from '../../shared/claudeStructuredSchemas.ts';

type GroupingKeywordInput = {
  keyword: string;
  search_volume: number | '-' | null | undefined;
};

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
const PREVIEW_ASSIGNMENT_MODEL = process.env.KEYWORD_GROUPING_PREVIEW_MODEL?.trim()
  || process.env.CLAUDE_MODEL
  || 'claude-sonnet-4-6';

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const start = trimmed.indexOf('{');
  if (start < 0) {
    throw new Error('Could not find a valid JSON object.');
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

  throw new Error('Could not find a complete JSON object.');
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
  parts.push(
    `Keyword Demand Landscape (${keywords.length} keywords):\n${keywords
      .map((item) => `- ${item.keyword} | ${typeof item.search_volume === 'number' ? item.search_volume : '-'}`)
      .join('\n')}`
  );
  return parts.join('\n\n');
}

function buildGroupingBlueprintKeywords(keywords: GroupingKeywordInput[]): GroupingKeywordInput[] {
  return [...keywords]
    .filter((keyword) => !BLUEPRINT_NOISE_PATTERN.test(keyword.keyword))
    .sort((a, b) => {
      const aVolume = typeof a.search_volume === 'number' ? a.search_volume : -1;
      const bVolume = typeof b.search_volume === 'number' ? b.search_volume : -1;
      if (bVolume !== aVolume) return bVolume - aVolume;
      return a.keyword.localeCompare(b.keyword);
    });
}

function buildPreviewGroupsFromBlueprint(raw: string): KeywordGroupingGroup[] {
  const parsed = JSON.parse(extractJsonObject(raw));
  const rawGroups = Array.isArray(parsed?.groups) ? parsed.groups : [];
  const usedSlugs = new Set<string>();
  const usedNames = new Set<string>();
  const nextGroups: Array<KeywordGroupingGroup | null> = rawGroups.map((group: any) => {
    const productLine = String(group?.product_line || '').trim();
    const pillar = String(group?.topic_pillar || '').trim();
    const intent = String(group?.intent || '').trim().toUpperCase() as PillarIntent;
    const keywordGroup = String(group?.keyword_group || '').trim();
    const slug = String(group?.slug || '').trim();

    if (!productLine || !pillar || !keywordGroup || !slug) return null;
    if (!['T', 'C', 'I', 'N'].includes(intent)) return null;
    if (BLUEPRINT_LOW_VALUE_GROUP_PATTERN.test(keywordGroup) || BLUEPRINT_LOW_VALUE_GROUP_PATTERN.test(slug)) return null;

    const nameKey = `${productLine.toLowerCase()}::${pillar.toLowerCase()}::${keywordGroup.toLowerCase()}`;
    if (usedNames.has(nameKey)) return null;

    let normalizedSlug = slug.startsWith('/') ? slug : `/${slug}`;
    if (!normalizedSlug.endsWith('/')) normalizedSlug = `${normalizedSlug}/`;

    const baseSlug = normalizedSlug.replace(/\/+$/, '') || '/group';
    let uniqueSlug = `${baseSlug}/`;
    let suffix = 2;
    while (usedSlugs.has(uniqueSlug)) {
      uniqueSlug = `${baseSlug}-${suffix}/`;
      suffix += 1;
    }

    usedNames.add(nameKey);
    usedSlugs.add(uniqueSlug);

    return {
      product_line: productLine,
      pillar,
      intent,
      keyword_group: keywordGroup,
      slug: uniqueSlug,
      keywords: [],
    };
  });

  return nextGroups.filter((group): group is KeywordGroupingGroup => group !== null);
}

function buildPreviewAssignmentUserMessage(
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

async function generateGroupingBlueprint(
  formData: Record<string, any>,
  keywords: GroupingKeywordInput[]
): Promise<{ groups: KeywordGroupingGroup[]; raw: string }> {
  const blueprintPrompt = getKeywordGroupingBlueprintPrompt();
  const blueprintKeywords = buildGroupingBlueprintKeywords(keywords);
  const userMessage = buildGroupingBlueprintUserMessage(formData, blueprintKeywords);
  const builderResult = await generateOnly(blueprintPrompt, userMessage, {
    model: PREVIEW_ASSIGNMENT_MODEL,
    jsonSchema: getKeywordGroupingBlueprintJsonSchema(),
  });
  const groups = buildPreviewGroupsFromBlueprint(builderResult.result);

  return {
    groups,
    raw:
      `provider=anthropic\n` +
      `model=${PREVIEW_ASSIGNMENT_MODEL}\n` +
      `business_context_included=true\n` +
      `planning_keyword_count=${blueprintKeywords.length}\n` +
      `draft_group_count=${groups.length}\n\n` +
      `Blueprint\n${builderResult.result}`,
  };
}

async function assignKeywordsToPreviewGroups(
  groups: KeywordGroupingGroup[],
  keywords: GroupingKeywordInput[]
): Promise<{ groups: KeywordGroupingGroup[]; raw: string }> {
  const assignmentPrompt = getKeywordGroupingPreviewAssignmentPrompt();
  let assignedGroups: KeywordGroupingGroup[] = groups.map((group) => ({
    ...group,
    keywords: [],
  }));
  const rawParts: string[] = [
    'assignment_provider=anthropic',
    `assignment_model=${PREVIEW_ASSIGNMENT_MODEL}`,
    `assignment_temperatures=${PREVIEW_ASSIGNMENT_TEMPERATURES.join(',')}`,
    `assignment_max_rounds=${MAX_PREVIEW_ASSIGNMENT_ROUNDS}`,
    `assignment_batch_size=${MAX_PREVIEW_ASSIGNMENT_KEYWORDS_PER_BATCH}`,
    `embedding_leftover_enabled=${PREVIEW_ASSIGNMENT_EMBEDDING_ENABLED}`,
  ];

  const runAssignmentPass = async (
    sourceKeywords: GroupingKeywordInput[],
    passLabel: string,
    assignmentInstruction: string,
    assignmentTemperature: number
  ) => {
    for (let index = 0; index < sourceKeywords.length; index += MAX_PREVIEW_ASSIGNMENT_KEYWORDS_PER_BATCH) {
      const keywordBatch = sourceKeywords.slice(index, index + MAX_PREVIEW_ASSIGNMENT_KEYWORDS_PER_BATCH);
      const userMessage = buildPreviewAssignmentUserMessage(assignedGroups, keywordBatch, {
        passLabel,
        assignmentInstruction,
      });
      const result = await generateOnly(assignmentPrompt, userMessage, {
        model: PREVIEW_ASSIGNMENT_MODEL,
        jsonSchema: getKeywordGroupingPreviewAssignmentJsonSchema(),
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
  let remainingKeywords = keywords.filter((keyword) => !assignedKeywordSet.has(keyword.keyword.trim().toLowerCase()));
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
  const assignmentResult = await assignKeywordsToPreviewGroups(blueprintResult.groups, keywords);
  return {
    groups: assignmentResult.groups,
    raw: `${blueprintResult.raw}\n\n${assignmentResult.raw}`,
    batchCount: 1,
  };
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
    const status = (err as any).code === 'auth_error' ? 401 : (err as any).code === 'rate_limit' ? 429 : 500;
    if (err instanceof AgentError) {
      res.status(status).json({ error: err.userMessage, code: err.code, retryable: err.retryable });
    } else {
      res.status(500).json({ error: (err as Error).message, code: 'unknown', retryable: false });
    }
  }
}
