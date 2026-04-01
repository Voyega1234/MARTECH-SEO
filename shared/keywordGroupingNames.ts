import type { KeywordGroupingGroup } from './keywordGroupingOutput.ts';

export type DraftNamingGroup = {
  id: number;
  product_line: string;
  pillar: string;
  intent: KeywordGroupingGroup['intent'];
  representative_keyword: string;
  keywords: KeywordGroupingGroup['keywords'];
};

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSlug(value: string): string {
  const slug = cleanText(value);
  if (!slug) return '';
  const withLeadingSlash = slug.startsWith('/') ? slug : `/${slug}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  if (start < 0) {
    throw new Error('Could not find a valid JSON object in naming output.');
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

  throw new Error('Could not find a complete JSON object in naming output.');
}

function makeUniqueSlug(slug: string, seenSlugs: Set<string>): string {
  if (!seenSlugs.has(slug)) return slug;
  const base = slug.endsWith('/') ? slug.slice(0, -1) : slug;
  let suffix = 2;
  while (true) {
    const candidate = `${base}-${suffix}/`;
    if (!seenSlugs.has(candidate)) return candidate;
    suffix += 1;
  }
}

export function parseKeywordGroupingNamesOutput(
  raw: string,
  draftGroups: DraftNamingGroup[]
): Array<{ id: number; keyword_group: string; slug: string }> {
  const parsed = JSON.parse(extractJsonObject(raw));
  const rawGroups = Array.isArray(parsed?.groups) ? parsed.groups : [];
  const draftsById = new Map(draftGroups.map((group) => [group.id, group]));
  const seenSlugs = new Set<string>();
  const output = new Map<number, { id: number; keyword_group: string; slug: string }>();

  for (const item of rawGroups) {
    const id = Number(item?.id);
    const draft = draftsById.get(id);
    if (!draft) continue;

    const keywordGroup = cleanText(item?.keyword_group) || draft.representative_keyword;
    const rawSlug = normalizeSlug(item?.slug);
    const fallbackSlug = `/${draft.representative_keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `group-${id}`}/`;
    const slug = makeUniqueSlug(rawSlug || fallbackSlug, seenSlugs);
    seenSlugs.add(slug);

    output.set(id, {
      id,
      keyword_group: keywordGroup,
      slug,
    });
  }

  for (const draft of draftGroups) {
    if (output.has(draft.id)) continue;
    const fallbackSlug = makeUniqueSlug(
      `/${draft.representative_keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `group-${draft.id}`}/`,
      seenSlugs
    );
    seenSlugs.add(fallbackSlug);
    output.set(draft.id, {
      id: draft.id,
      keyword_group: draft.representative_keyword,
      slug: fallbackSlug,
    });
  }

  return draftGroups.map((draft) => output.get(draft.id)!).filter(Boolean);
}
