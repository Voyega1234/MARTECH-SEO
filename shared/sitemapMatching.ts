import type { SitemapPageType, SitemapRowSource } from './sitemapRows.ts';

export interface SitemapMatchedKeyword {
  keyword: string;
  search_volume: number | '-';
}

export type SitemapMatchingRowOrigin = 'original' | 'added_during_matching';

export interface SitemapMatchRow {
  section: string;
  sub_section_or_category: string;
  page_title: string;
  slug_and_path: string;
  dimension_name: string | null;
  page_type: SitemapPageType;
  keyword_group: string | '—';
  l3_keywords_top_5: SitemapMatchedKeyword[];
  matched_keywords: SitemapMatchedKeyword[];
  matching_note: string | null;
  row_origin: SitemapMatchingRowOrigin;
  source: SitemapRowSource;
}

export interface SitemapMatchingResult {
  rows: SitemapMatchRow[];
  unmatched_keywords: SitemapMatchedKeyword[];
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const start = trimmed.indexOf('{');
  if (start < 0) {
    throw new Error('Could not find a valid JSON object in sitemap matching output.');
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

  throw new Error('Could not find a complete JSON object in sitemap matching output.');
}

function normalizeMatchedKeywords(list: unknown): SitemapMatchedKeyword[] {
  return Array.isArray(list)
    ? list
        .map((item: any) => {
          const keyword = cleanText(item?.keyword);
          if (!keyword) return null;
          return {
            keyword,
            search_volume: typeof item?.search_volume === 'number' ? item.search_volume : '-',
          } satisfies SitemapMatchedKeyword;
        })
        .filter((item): item is SitemapMatchedKeyword => item !== null)
    : [];
}

export function parseSitemapMatchingOutput(raw: string): SitemapMatchingResult {
  const parsed = JSON.parse(extractJsonObject(raw));
  const rows = Array.isArray(parsed?.rows)
    ? parsed.rows
        .map((row: any) => {
          const section = cleanText(row?.section);
          const pageTitle = cleanText(row?.page_title);
          let slug = cleanText(row?.slug_and_path);
          const pageType = cleanText(row?.page_type) as SitemapPageType;
          if (!section || !pageTitle || !slug || !pageType) return null;
          if (!slug.startsWith('/')) slug = `/${slug}`;
          if (!slug.endsWith('/')) slug = `${slug}/`;

          return {
            section,
            sub_section_or_category: cleanText(row?.sub_section_or_category),
            page_title: pageTitle,
            slug_and_path: slug,
            dimension_name: cleanText(row?.dimension_name) || null,
            page_type: pageType,
            keyword_group: cleanText(row?.keyword_group) || '—',
            l3_keywords_top_5: normalizeMatchedKeywords(row?.l3_keywords_top_5).slice(0, 5),
            matched_keywords: normalizeMatchedKeywords(row?.matched_keywords),
            matching_note: cleanText(row?.matching_note) || null,
            row_origin: row?.row_origin === 'added_during_matching' ? 'added_during_matching' : 'original',
            source: row?.source === 'business_page' ? 'business_page' : 'topic_page',
          } satisfies SitemapMatchRow;
        })
        .filter((row: SitemapMatchRow | null): row is SitemapMatchRow => row !== null)
    : [];

  return {
    rows,
    unmatched_keywords: normalizeMatchedKeywords(parsed?.unmatched_keywords),
  };
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function renderSitemapMatchingCsv(result: SitemapMatchingResult): string {
  const lines = [
    'Section,Sub-section or Category,Page Title,Slug and Path,Dimension Name,Page Type,Keyword Group,L3 Keywords (Top 5),Matched Keywords,Matching Note,Row Origin,Source',
  ];

  for (const row of result.rows) {
    lines.push(
      [
        row.section,
        row.sub_section_or_category,
        row.page_title,
        row.slug_and_path,
        row.dimension_name || '',
        row.page_type,
        row.keyword_group,
        row.l3_keywords_top_5.map((item) => `${item.keyword}, ${typeof item.search_volume === 'number' ? item.search_volume : '-'}`).join(' | '),
        row.matched_keywords.map((item) => `${item.keyword}, ${typeof item.search_volume === 'number' ? item.search_volume : '-'}`).join(' | '),
        row.matching_note || '',
        row.row_origin,
        row.source,
      ].map(csvEscape).join(',')
    );
  }

  return lines.join('\n');
}
