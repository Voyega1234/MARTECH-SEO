export type SitemapPageType =
  | 'Homepage'
  | 'Category Page'
  | 'Service Page'
  | 'Location Page'
  | 'Comparison Page'
  | 'Guide'
  | 'FAQ'
  | 'Calculator / Tool'
  | 'Brand/Provider Page'
  | 'Lead Form'
  | 'Supporting Page';

export type SitemapRowSource = 'topic_page' | 'business_page';

export interface SitemapRow {
  section: string;
  sub_section_or_category: string;
  page_title: string;
  slug_and_path: string;
  dimension_name: string | null;
  page_type: SitemapPageType;
  keyword_group: string | '—';
  l3_suggested_keywords: string[] | '—';
  source: SitemapRowSource;
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
    throw new Error('Could not find a valid JSON object in sitemap output.');
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

  throw new Error('Could not find a complete JSON object in sitemap output.');
}

const ALLOWED_PAGE_TYPES = new Set<SitemapPageType>([
  'Homepage',
  'Category Page',
  'Service Page',
  'Location Page',
  'Comparison Page',
  'Guide',
  'FAQ',
  'Calculator / Tool',
  'Brand/Provider Page',
  'Lead Form',
  'Supporting Page',
]);

export function parseSitemapRowsOutput(raw: string): SitemapRow[] {
  const parsed = JSON.parse(extractJsonObject(raw));
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
  const usedSlugs = new Set<string>();

  return rows
    .map((row: any) => {
      const section = cleanText(row?.section);
      const subSection = cleanText(row?.sub_section_or_category);
      const pageTitle = cleanText(row?.page_title);
      let slug = cleanText(row?.slug_and_path);
      const pageType = cleanText(row?.page_type) as SitemapPageType;
      const dimensionName = cleanText(row?.dimension_name) || null;
      const keywordGroup = cleanText(row?.keyword_group) || '—';
      const suggestedKeywords = Array.isArray(row?.l3_suggested_keywords)
        ? row.l3_suggested_keywords.map((value: unknown) => cleanText(value)).filter(Boolean)
        : [];
      const source = row?.source === 'business_page' ? 'business_page' : 'topic_page';

      if (!section || !pageTitle || !slug || !ALLOWED_PAGE_TYPES.has(pageType)) return null;
      if (!slug.startsWith('/')) slug = `/${slug}`;
      if (!slug.endsWith('/')) slug = `${slug}/`;
      if (usedSlugs.has(slug)) return null;
      usedSlugs.add(slug);

      return {
        section,
        sub_section_or_category: subSection,
        page_title: pageTitle,
        slug_and_path: slug,
        dimension_name: dimensionName,
        page_type: pageType,
        keyword_group: keywordGroup || '—',
        l3_suggested_keywords: suggestedKeywords.length ? suggestedKeywords.slice(0, 5) : '—',
        source,
      } satisfies SitemapRow;
    })
    .filter((row): row is SitemapRow => row !== null);
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function renderSitemapRowsCsv(rows: SitemapRow[]): string {
  const lines = [
    'Section,Sub-section or Category,Page Title,Slug and Path,Dimension Name,Page Type,Keyword Group,L3 Suggested Keywords,Source',
  ];

  for (const row of rows) {
    lines.push(
      [
        row.section,
        row.sub_section_or_category,
        row.page_title,
        row.slug_and_path,
        row.dimension_name || '',
        row.page_type,
        row.keyword_group,
        Array.isArray(row.l3_suggested_keywords) ? row.l3_suggested_keywords.join(' | ') : '—',
        row.source,
      ].map(csvEscape).join(',')
    );
  }

  return lines.join('\n');
}
