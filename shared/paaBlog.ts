export type PaaSeedPlan = {
  thai_seeds: string[];
  english_seeds: string[];
};

export type PaaCollectedEntry = {
  query: string;
  source: 'PAA' | 'Related Search';
  source_seed: string;
  seed_language: 'th' | 'en';
};

export type PaaIdeaRow = {
  blog_title: string;
  source: 'PAA' | 'Related Search';
  source_seed: string;
  programmatic_variables: string;
};

export type PaaKeywordMap = {
  groups: Array<{
    product_line: string;
    pillar: string;
    keyword_group: string;
    keywords: Array<{
      keyword: string;
      search_volume: number | '-';
    }>;
  }>;
};

export function normalizePaaText(value: string): string {
  let text = value.trim().replace(/\s+/g, ' ');

  // DFS often inserts spaces between Thai characters. Rejoin them repeatedly.
  for (let i = 0; i < 6; i += 1) {
    const next = text.replace(/([ก-๙])\s+(?=[ก-๙])/g, '$1');
    if (next === text) break;
    text = next;
  }

  return text.trim();
}

export function normalizeIntentKey(value: string): string {
  return normalizePaaText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function dedupeCollectedEntries(entries: PaaCollectedEntry[]): PaaCollectedEntry[] {
  const seen = new Set<string>();
  const deduped: PaaCollectedEntry[] = [];

  for (const entry of entries) {
    const normalizedQuery = normalizePaaText(entry.query);
    if (!normalizedQuery) continue;
    const key = `${entry.source}::${normalizeIntentKey(normalizedQuery)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      ...entry,
      query: normalizedQuery,
    });
  }

  return deduped;
}

export function buildKeywordMapTermSet(keywordMap: PaaKeywordMap | null): Set<string> {
  const terms = new Set<string>();
  if (!keywordMap) return terms;

  for (const group of keywordMap.groups) {
    terms.add(normalizeIntentKey(group.pillar));
    terms.add(normalizeIntentKey(group.keyword_group));
    for (const keyword of group.keywords) {
      terms.add(normalizeIntentKey(keyword.keyword));
    }
  }

  return terms;
}

export function buildKeywordMapReference(keywordMap: PaaKeywordMap | null): string {
  if (!keywordMap) return 'No keyword map available.';

  return keywordMap.groups
    .map((group) => {
      const preview = group.keywords.slice(0, 8).map((item) => item.keyword).join(' | ');
      return `- ${group.product_line} > ${group.pillar} > ${group.keyword_group} | ${preview}`;
    })
    .join('\n');
}

export function filterCannibalizingIdeas(
  ideas: PaaIdeaRow[],
  keywordMap: PaaKeywordMap | null
): PaaIdeaRow[] {
  const keywordMapTerms = buildKeywordMapTermSet(keywordMap);
  const seenTitles = new Set<string>();
  const filtered: PaaIdeaRow[] = [];

  for (const idea of ideas) {
    const normalizedTitle = normalizeIntentKey(idea.blog_title);
    if (!normalizedTitle) continue;
    if (seenTitles.has(normalizedTitle)) continue;
    if (keywordMapTerms.has(normalizedTitle)) continue;
    seenTitles.add(normalizedTitle);
    filtered.push({
      ...idea,
      blog_title: normalizePaaText(idea.blog_title),
      source_seed: normalizePaaText(idea.source_seed),
      programmatic_variables: normalizePaaText(idea.programmatic_variables || ''),
    });
  }

  return filtered;
}
