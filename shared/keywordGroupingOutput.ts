import type { KeywordGroupingPlan, PillarIntent } from './keywordGroupingPlan.ts';

export interface KeywordGroupingVariation {
  keyword: string;
  search_volume: number | '-';
}

export interface KeywordGroupingGroup {
  product_line: string;
  pillar: string;
  intent: PillarIntent;
  keyword_group: string;
  slug: string;
  keywords: KeywordGroupingVariation[];
}

export interface KeywordGroupingBatchResult {
  groups: KeywordGroupingGroup[];
}

export interface KeywordGroupingMergeInstruction {
  keep: number;
  merge: number[];
}

type KeywordGroupingIssueCounts = {
  invalid_indexes: number;
  duplicate_indexes: number;
  invalid_group_ids: number;
  repaired_duplicate_slugs: number;
  fallback_keywords: number;
};

function emptyIssueCounts(): KeywordGroupingIssueCounts {
  return {
    invalid_indexes: 0,
    duplicate_indexes: 0,
    invalid_group_ids: 0,
    repaired_duplicate_slugs: 0,
    fallback_keywords: 0,
  };
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeSlug(value: string): string {
  const slug = cleanText(value);
  if (!slug) return '';
  const withLeadingSlash = slug.startsWith('/') ? slug : `/${slug}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const start = trimmed.indexOf('{');
  if (start < 0) {
    throw new Error('Could not find a valid JSON object in grouping output.');
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

  throw new Error('Could not find a complete JSON object in grouping output.');
}

type AllowedKeywordInput = {
  keyword: string;
  search_volume: number | '-' | null | undefined;
};

function buildAllowedKeywordMap(keywords: AllowedKeywordInput[]) {
  const allowedKeywords = new Map<string, KeywordGroupingVariation>();

  for (const item of keywords) {
    const keyword = cleanText(item.keyword);
    if (!keyword) continue;
    allowedKeywords.set(normalizeKey(keyword), {
      keyword,
      search_volume: typeof item.search_volume === 'number' ? item.search_volume : '-',
    });
  }

  return allowedKeywords;
}

function buildAllowedKeywordList(keywords: AllowedKeywordInput[]): KeywordGroupingVariation[] {
  return [...keywords]
    .map((item) => {
      const keyword = cleanText(item.keyword);
      if (!keyword) return null;
      return {
        keyword,
        search_volume: typeof item.search_volume === 'number' ? item.search_volume : '-',
      } as KeywordGroupingVariation;
    })
    .filter(Boolean) as KeywordGroupingVariation[];
}

function makeUniqueSlug(slug: string, seenSlugs: Set<string>): { slug: string; repaired: boolean } {
  if (!seenSlugs.has(slug)) {
    return { slug, repaired: false };
  }

  const normalized = normalizeSlug(slug);
  const withoutTrailingSlash = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  let suffix = 2;

  while (true) {
    const candidate = normalizeSlug(`${withoutTrailingSlash}-${suffix}`);
    if (!seenSlugs.has(candidate)) {
      return { slug: candidate, repaired: true };
    }
    suffix += 1;
  }
}

function appendNeedsReviewGroup(
  groups: KeywordGroupingGroup[],
  keywords: KeywordGroupingVariation[],
  slug = '/needs-review/'
) {
  if (!keywords.length) return;

  groups.push({
    product_line: 'Needs Review',
    pillar: 'Ungrouped',
    intent: 'I',
    keyword_group: 'Ungrouped Keywords',
    slug,
    keywords,
  });
}

export function buildFallbackKeywordGroupingBatchResult(
  allowedBatchKeywords: AllowedKeywordInput[],
  batchLabel?: string
): KeywordGroupingBatchResult {
  const keywords = buildAllowedKeywordList(allowedBatchKeywords);
  const fallbackSlug = batchLabel ? `/needs-review-${batchLabel}/` : '/needs-review/';
  const groups: KeywordGroupingGroup[] = [];
  appendNeedsReviewGroup(groups, keywords, fallbackSlug);
  return { groups };
}

export function extractNeedsReviewKeywords(groups: KeywordGroupingGroup[]): KeywordGroupingVariation[] {
  return groups
    .filter((group) => normalizeKey(group.product_line) === 'needs review' || normalizeKey(group.pillar) === 'ungrouped')
    .flatMap((group) => group.keywords);
}

export function mergeRepairGroupsIntoResults(
  groups: KeywordGroupingGroup[],
  repairedGroups: KeywordGroupingGroup[]
): KeywordGroupingGroup[] {
  if (!repairedGroups.length) return groups;

  const repairedKeywordKeys = new Set(
    repairedGroups.flatMap((group) => group.keywords.map((keyword) => normalizeKey(keyword.keyword)))
  );

  const nextGroups: KeywordGroupingGroup[] = [];
  for (const group of groups) {
    const isNeedsReview = normalizeKey(group.product_line) === 'needs review' || normalizeKey(group.pillar) === 'ungrouped';
    if (!isNeedsReview) {
      nextGroups.push(group);
      continue;
    }

    const remainingKeywords = group.keywords.filter(
      (keyword) => !repairedKeywordKeys.has(normalizeKey(keyword.keyword))
    );

    if (remainingKeywords.length) {
      nextGroups.push({
        ...group,
        keywords: remainingKeywords,
      });
    }
  }

  nextGroups.push(...repairedGroups);
  return mergeKeywordGroupingBatchResults([{ groups: nextGroups }]);
}

export function ensureKeywordGroupingCoverage(
  groups: KeywordGroupingGroup[],
  allKeywords: AllowedKeywordInput[]
): KeywordGroupingGroup[] {
  const seenKeywords = new Set<string>();
  for (const group of groups) {
    for (const keyword of group.keywords) {
      seenKeywords.add(normalizeKey(keyword.keyword));
    }
  }

  const missingKeywords = buildAllowedKeywordList(allKeywords).filter(
    (keyword) => !seenKeywords.has(normalizeKey(keyword.keyword))
  );

  if (!missingKeywords.length) {
    return groups;
  }

  const nextGroups = [...groups];
  appendNeedsReviewGroup(nextGroups, missingKeywords, '/needs-review-global/');
  return nextGroups;
}

export function parseAndValidateKeywordGroupingBatchOutput(
  raw: string,
  allowedBatchKeywords: AllowedKeywordInput[],
  plan: KeywordGroupingPlan
): KeywordGroupingBatchResult {
  const parsed = JSON.parse(extractJsonObject(raw));
  const rawGroups = Array.isArray(parsed?.groups) ? parsed.groups : [];
  if (!rawGroups.length) {
    throw new Error('Grouping batch output must contain at least one group.');
  }

  const allowedKeywordMap = buildAllowedKeywordMap(allowedBatchKeywords);
  const allowedKeywordList = buildAllowedKeywordList(allowedBatchKeywords);
  const seenKeywords = new Set<string>();
  const issueCounts = emptyIssueCounts();

  const groups: KeywordGroupingGroup[] = [];
  const groupIndexByKey = new Map<string, number>();
  const seenSlugs = new Set<string>();

  for (const rawGroup of rawGroups) {
    const productLineIndex = Number(rawGroup?.pl);
    const pillarIndex = Number(rawGroup?.pi);
    const productLineData = Number.isInteger(productLineIndex) ? plan.product_lines[productLineIndex] : undefined;
    const pillarData = productLineData && Number.isInteger(pillarIndex) ? productLineData.pillars[pillarIndex] : undefined;

    if (!productLineData || !pillarData) {
      issueCounts.invalid_group_ids += 1;
    }

    const productLine = productLineData?.name || 'Needs Review';
    const pillar = pillarData?.name || 'Ungrouped';
    const intent = (pillarData?.intent || 'I') as PillarIntent;
    const keywordGroup = cleanText(rawGroup?.kg || rawGroup?.keyword_group);
    const slug = normalizeSlug(rawGroup?.slug);
    const rawKeywordIndexes = Array.isArray(rawGroup?.k) ? rawGroup.k : [];

    if (!keywordGroup || !slug || !rawKeywordIndexes.length) continue;
    const groupKey = `${normalizeKey(productLine)}::${normalizeKey(pillar)}::${normalizeKey(keywordGroup)}`;
    const existingGroupIndex = groupIndexByKey.get(groupKey);
    let currentGroup: KeywordGroupingGroup | null =
      typeof existingGroupIndex === 'number' ? groups[existingGroupIndex] : null;

    let resolvedSlug = slug;
    if (!currentGroup) {
      const slugResult = makeUniqueSlug(slug, seenSlugs);
      resolvedSlug = slugResult.slug;
      if (slugResult.repaired) {
        issueCounts.repaired_duplicate_slugs += 1;
      }
    }

    const keywords: KeywordGroupingVariation[] = currentGroup ? [...currentGroup.keywords] : [];

    for (const rawKeywordIndex of rawKeywordIndexes) {
      const keywordIndex = Number(rawKeywordIndex);
      if (!Number.isInteger(keywordIndex)) {
        issueCounts.invalid_indexes += 1;
        continue;
      }
      const allowedKeyword = allowedKeywordList[keywordIndex];
      if (!allowedKeyword) {
        issueCounts.invalid_indexes += 1;
        continue;
      }
      if (seenKeywords.has(normalizeKey(allowedKeyword.keyword))) {
        issueCounts.duplicate_indexes += 1;
        continue;
      }

      seenKeywords.add(normalizeKey(allowedKeyword.keyword));
      keywords.push(allowedKeyword);
    }

    if (!keywords.length) continue;

    if (currentGroup) {
      currentGroup.keywords = keywords;
      continue;
    }

    seenSlugs.add(resolvedSlug);
    groups.push({
      product_line: productLine,
      pillar,
      intent,
      keyword_group: keywordGroup,
      slug: resolvedSlug,
      keywords,
    });
    groupIndexByKey.set(groupKey, groups.length - 1);
  }

  const missingKeywordItems = [...allowedKeywordMap.values()].filter(
    (item) => !seenKeywords.has(normalizeKey(item.keyword))
  );

  if (missingKeywordItems.length) {
    issueCounts.fallback_keywords = missingKeywordItems.length;
    appendNeedsReviewGroup(groups, missingKeywordItems);
  }

  if (!groups.length) {
    throw new Error('Grouping batch output did not contain any valid groups.');
  }

  return { groups };
}

export function mergeKeywordGroupingBatchResults(results: KeywordGroupingBatchResult[]): KeywordGroupingGroup[] {
  const groupMap = new Map<string, KeywordGroupingGroup>();

  for (const result of results) {
    for (const group of result.groups) {
      const key = `${normalizeKey(group.product_line)}::${normalizeKey(group.pillar)}::${normalizeKey(group.keyword_group)}::${group.slug}`;
      const existingGroup = groupMap.get(key);

      if (!existingGroup) {
        groupMap.set(key, {
          ...group,
          keywords: [...group.keywords],
        });
        continue;
      }

      const seenKeywords = new Set(existingGroup.keywords.map((item) => normalizeKey(item.keyword)));
      for (const keyword of group.keywords) {
        if (seenKeywords.has(normalizeKey(keyword.keyword))) continue;
        seenKeywords.add(normalizeKey(keyword.keyword));
        existingGroup.keywords.push(keyword);
      }
    }
  }

  return [...groupMap.values()].map((group) => ({
    ...group,
    keywords: group.keywords.sort((a, b) => {
      const aVolume = typeof a.search_volume === 'number' ? a.search_volume : -1;
      const bVolume = typeof b.search_volume === 'number' ? b.search_volume : -1;
      if (bVolume !== aVolume) return bVolume - aVolume;
      return a.keyword.localeCompare(b.keyword);
    }),
  }));
}

export function applyKeywordGroupingMerges(
  groups: KeywordGroupingGroup[],
  instructions: KeywordGroupingMergeInstruction[]
): KeywordGroupingGroup[] {
  if (!instructions.length) return groups;

  const consumed = new Set<number>();
  const nextGroups: KeywordGroupingGroup[] = [];

  for (let index = 0; index < groups.length; index += 1) {
    if (consumed.has(index)) continue;

    const instruction = instructions.find((item) => item.keep === index);
    if (!instruction) {
      nextGroups.push(groups[index]);
      continue;
    }

    const baseGroup = groups[index];
    const mergeIndexes = instruction.merge.filter((mergeIndex) => mergeIndex >= 0 && mergeIndex < groups.length);
    const candidates = [baseGroup, ...mergeIndexes.map((mergeIndex) => groups[mergeIndex])];

    const sameScope = candidates.every(
      (group) =>
        normalizeKey(group.product_line) === normalizeKey(baseGroup.product_line) &&
        normalizeKey(group.pillar) === normalizeKey(baseGroup.pillar) &&
        group.intent === baseGroup.intent
    );

    if (!sameScope) {
      nextGroups.push(baseGroup);
      continue;
    }

    const keywordMap = new Map<string, KeywordGroupingVariation>();
    for (const candidate of candidates) {
      for (const keyword of candidate.keywords) {
        keywordMap.set(normalizeKey(keyword.keyword), keyword);
      }
    }

    nextGroups.push({
      ...baseGroup,
      keywords: [...keywordMap.values()].sort((a, b) => {
        const aVolume = typeof a.search_volume === 'number' ? a.search_volume : -1;
        const bVolume = typeof b.search_volume === 'number' ? b.search_volume : -1;
        if (bVolume !== aVolume) return bVolume - aVolume;
        return a.keyword.localeCompare(b.keyword);
      }),
    });

    consumed.add(index);
    for (const mergeIndex of mergeIndexes) {
      consumed.add(mergeIndex);
    }
  }

  return nextGroups;
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function getGroupTopVolume(group: KeywordGroupingGroup): number {
  const numericVolumes = group.keywords
    .map((item) => (typeof item.search_volume === 'number' ? item.search_volume : -1))
    .filter((value) => value >= 0);

  return numericVolumes.length ? Math.max(...numericVolumes) : -1;
}

function isCoreGroup(group: KeywordGroupingGroup): boolean {
  return normalizeKey(group.keyword_group) === normalizeKey(group.pillar);
}

export function renderKeywordGroupingCsv(groups: KeywordGroupingGroup[]): string {
  const lines = [
    'Product Line,Topic Pillar (Level 1),Pillar Intent,Keyword Group (Level 2),URL Slug (Target URL),Keywords / Level 3 Variations (Keyword, Volume)',
  ];

  const sortedGroups = [...groups].sort((a, b) => {
    if (a.product_line !== b.product_line) return a.product_line.localeCompare(b.product_line);
    if (a.pillar !== b.pillar) return a.pillar.localeCompare(b.pillar);

    const aIsCore = isCoreGroup(a);
    const bIsCore = isCoreGroup(b);
    if (aIsCore !== bIsCore) return aIsCore ? -1 : 1;

    const aTopVolume = getGroupTopVolume(a);
    const bTopVolume = getGroupTopVolume(b);
    if (bTopVolume !== aTopVolume) return bTopVolume - aTopVolume;

    return a.keyword_group.localeCompare(b.keyword_group);
  });

  for (const group of sortedGroups) {
    const keywordCell = group.keywords
      .map((item) => `${item.keyword}, ${typeof item.search_volume === 'number' ? item.search_volume : '-'}`)
      .join(' | ');

    lines.push([
      group.product_line,
      group.pillar,
      group.intent,
      group.keyword_group,
      group.slug,
      keywordCell,
    ].map(csvEscape).join(','));
  }

  return lines.join('\n');
}
