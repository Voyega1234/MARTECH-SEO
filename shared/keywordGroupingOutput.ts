import type { PillarIntent } from './keywordGroupingPlan.ts';

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

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

type AllowedKeywordInput = {
  keyword: string;
  search_volume: number | '-' | null | undefined;
};

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
