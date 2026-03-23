export interface SitemapKeyword {
  keyword: string;
  volume: number;
  position?: number;
}

export interface SitemapSection {
  section: string;
  sub_section_or_category: string;
  page_title: string;
  slug_and_path: string;
  keywords: SitemapKeyword[];
  keyword_group: string;
  conversion_potential: 'Low' | 'Medium' | 'High';
  traffic_potential: 'Low' | 'Medium' | 'High';
}

export interface SitemapRefinementCandidate {
  index: number;
  product_line: string;
  topic_pillar: string;
  pillar_intent: string;
  keyword_group: string;
  slug_and_path: string;
  keywords: SitemapKeyword[];
  current_section: string;
  current_sub_section_or_category: string;
  current_page_title: string;
  confidence: number;
  reason: string;
}

export interface SitemapRefinement {
  index: number;
  section: string;
  sub_section_or_category: string;
  page_title: string;
  slug_and_path?: string;
}

interface KeywordEntry {
  keyword: string;
  volume: number | string;
  position?: number;
}

interface KeywordGroup {
  keyword_group: string;
  url_slug: string;
  keywords: KeywordEntry[];
}

interface TopicPillar {
  topic_pillar: string;
  pillar_intent: string;
  keyword_groups: KeywordGroup[];
}

interface ProductLine {
  product_line: string;
  topic_pillars: TopicPillar[];
}

interface KeywordData {
  location?: string;
  product_lines: ProductLine[];
}

const PRICE_RE = /(ราคา|price|pricing|cost|quote|quotation|แพ็กเกจ|package|ค่าใช้จ่าย|ค่าบริการ|งบ)/i;
const INFO_RE = /(คือ|what is|วิธี|how to|คู่มือ|guide|เทคนิค|tips|benefits|ข้อดี|review|รีวิว|compare|comparison|vs|ดีที่สุด|best|faq|checklist)/i;
const SERVICE_RE = /(บริการ|service|รับ|ติดตั้ง|installation|agency|บริษัท|จ้าง|consult|solutions?|ผู้ให้บริการ)/i;
const BLOG_SECTION = 'Blog';
const PRICE_SECTION = 'Price';
const PRODUCT_SECTION = 'Products';
const SERVICE_SECTION = 'Service';
const HOME_SECTION = 'Home';

function compactText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizePath(path: string, fallbackKeywordGroup: string): string {
  const raw = compactText(path);
  if (raw) {
    const trimmed = raw.replace(/^\/+|\/+$/g, '');
    return trimmed ? `/${trimmed}/` : '/';
  }

  const slug = fallbackKeywordGroup
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

  return slug ? `/${slug}/` : '/';
}

function numericVolume(value: number | string): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function sortedKeywords(keywords: KeywordEntry[]): SitemapKeyword[] {
  return [...keywords]
    .sort((a, b) => numericVolume(b.volume) - numericVolume(a.volume))
    .map((kw) => ({
      keyword: compactText(kw.keyword),
      volume: numericVolume(kw.volume),
      ...(typeof kw.position === 'number' ? { position: kw.position } : {}),
    }))
    .filter((kw) => kw.keyword);
}

function maxVolume(keywords: SitemapKeyword[]): number {
  return keywords.reduce((max, kw) => Math.max(max, kw.volume), 0);
}

function normalizeSection(section: string, fallback: string): string {
  const value = compactText(section).toLowerCase();
  if (!value) return fallback;
  if (value === 'home') return HOME_SECTION;
  if (['product', 'products', 'shop', 'category', 'categories', 'collection', 'collections'].includes(value)) {
    return PRODUCT_SECTION;
  }
  if (['price', 'prices', 'pricing', 'quote', 'quotes'].includes(value)) {
    return PRICE_SECTION;
  }
  if (['service', 'services', 'solution', 'solutions'].includes(value)) {
    return SERVICE_SECTION;
  }
  if (['blog', 'blogs', 'guide', 'guides', 'article', 'articles', 'insights', 'knowledge'].includes(value)) {
    return BLOG_SECTION;
  }
  return fallback;
}

function detectSection(
  pillarIntent: string,
  keywordGroup: string,
  topicPillar: string,
  keywords: SitemapKeyword[],
): { section: string; confidence: number; reason: string } {
  const combined = [
    compactText(keywordGroup),
    compactText(topicPillar),
    ...keywords.map((kw) => kw.keyword),
  ].join(' ');

  const intent = compactText(pillarIntent).toLowerCase();
  const hasPrice = PRICE_RE.test(combined);
  const hasInfo = INFO_RE.test(combined);
  const hasService = SERVICE_RE.test(combined);

  if (hasPrice) return { section: PRICE_SECTION, confidence: 0.95, reason: 'price-pattern' };
  if (intent === 'informational' || hasInfo) return { section: BLOG_SECTION, confidence: 0.92, reason: 'informational-intent' };
  if (intent === 'transactional') return { section: SERVICE_SECTION, confidence: 0.95, reason: 'transactional-intent' };
  if (hasService) return { section: SERVICE_SECTION, confidence: 0.85, reason: 'service-pattern' };
  if (intent === 'commercial') return { section: SERVICE_SECTION, confidence: 0.72, reason: 'commercial-default' };

  return { section: SERVICE_SECTION, confidence: 0.6, reason: 'default-service' };
}

function subSectionFor(section: string, productLine: string, topicPillar: string): string {
  if (section === BLOG_SECTION) return compactText(topicPillar) || compactText(productLine);
  return compactText(productLine) || compactText(topicPillar);
}

function pageTitleFor(keywordGroup: string, businessName: string): string {
  const group = compactText(keywordGroup);
  const brand = compactText(businessName);
  if (!group) return brand || 'Untitled Page';
  if (!brand || group.toLowerCase().includes(brand.toLowerCase())) return group;
  return `${group} | ${brand}`;
}

function conversionPotentialFor(section: string, pillarIntent: string): 'Low' | 'Medium' | 'High' {
  const intent = compactText(pillarIntent).toLowerCase();
  if (section === PRICE_SECTION || section === PRODUCT_SECTION || intent === 'transactional') return 'High';
  if (section === SERVICE_SECTION || intent === 'commercial') return 'Medium';
  return 'Low';
}

function trafficPotentialFor(keywords: SitemapKeyword[]): 'Low' | 'Medium' | 'High' {
  const peak = maxVolume(keywords);
  if (peak >= 3000) return 'High';
  if (peak >= 1000) return 'Medium';
  return 'Low';
}

function extractBusinessName(businessContext: string): string {
  const raw = compactText(businessContext);
  if (!raw) return '';
  const separator = raw.includes('—') ? '—' : raw.includes('-') ? '-' : '';
  if (!separator) return raw.slice(0, 60);
  return compactText(raw.split(separator)[0]);
}

export function parseKeywordData(input: unknown): KeywordData | null {
  try {
    const parsed = typeof input === 'string' ? JSON.parse(input) : input;
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as KeywordData).product_lines)) {
      return parsed as KeywordData;
    }
  } catch {
    // Invalid JSON
  }
  return null;
}

export function buildHybridSitemap(
  input: unknown,
  businessContext: string,
): { sections: SitemapSection[]; aiCandidates: SitemapRefinementCandidate[] } {
  const data = parseKeywordData(input);
  if (!data) throw new Error('Invalid keyword data');

  const businessName = extractBusinessName(businessContext);
  const sections: SitemapSection[] = [];
  const aiCandidates: SitemapRefinementCandidate[] = [];

  for (const productLine of data.product_lines || []) {
    for (const topicPillar of productLine.topic_pillars || []) {
      for (const keywordGroup of topicPillar.keyword_groups || []) {
        const keywords = sortedKeywords(keywordGroup.keywords || []);
        const { section, confidence, reason } = detectSection(
          topicPillar.pillar_intent,
          keywordGroup.keyword_group,
          topicPillar.topic_pillar,
          keywords,
        );

        const entry: SitemapSection = {
          section,
          sub_section_or_category: subSectionFor(
            section,
            productLine.product_line,
            topicPillar.topic_pillar,
          ),
          page_title: pageTitleFor(keywordGroup.keyword_group, businessName),
          slug_and_path: normalizePath(keywordGroup.url_slug, keywordGroup.keyword_group),
          keywords,
          keyword_group: compactText(keywordGroup.keyword_group),
          conversion_potential: conversionPotentialFor(section, topicPillar.pillar_intent),
          traffic_potential: trafficPotentialFor(keywords),
        };

        const index = sections.push(entry) - 1;

        aiCandidates.push({
          index,
          product_line: compactText(productLine.product_line),
          topic_pillar: compactText(topicPillar.topic_pillar),
          pillar_intent: compactText(topicPillar.pillar_intent),
          keyword_group: entry.keyword_group,
          slug_and_path: entry.slug_and_path,
          keywords,
          current_section: entry.section,
          current_sub_section_or_category: entry.sub_section_or_category,
          current_page_title: entry.page_title,
          confidence,
          reason,
        });
      }
    }
  }

  if (sections.length > 0) {
    const homepageKeywords = [...sections]
      .sort((a, b) => maxVolume(b.keywords) - maxVolume(a.keywords))
      .slice(0, 3)
      .flatMap((section) => section.keywords.slice(0, 1))
      .filter((kw, index, arr) => arr.findIndex((item) => item.keyword === kw.keyword) === index);

    sections.unshift({
      section: HOME_SECTION,
      sub_section_or_category: '',
      page_title: businessName || 'Home',
      slug_and_path: '/',
      keywords: homepageKeywords,
      keyword_group: homepageKeywords[0]?.keyword || businessName || 'Home',
      conversion_potential: 'High',
      traffic_potential: trafficPotentialFor(homepageKeywords),
    });

    for (const candidate of aiCandidates) {
      candidate.index += 1;
    }
  }

  return { sections, aiCandidates };
}

export function buildRefinementPrompt(): string {
  return `You enrich sitemap entries using the provided business context and keyword evidence.

Return ONLY valid JSON:
{
  "items": [
    {
      "index": 0,
      "section": "Products | Service | Price | Blog",
      "sub_section_or_category": "string",
      "page_title": "string"
    }
  ]
}

Rules:
- Return one item for every input index.
- Choose only from section values: Products, Service, Price, Blog.
- Use the current slug only as context. Do not rewrite paths.
- Prefer Products for product/category pages, Service for service pages, Price for pricing/quote pages, and Blog for informational pages.
- Preserve the original meaning of each keyword group.
- Do not invent new keyword groups.`;
}

export function buildRefinementUserMessage(
  businessContext: string,
  aiCandidates: SitemapRefinementCandidate[],
): string {
  return JSON.stringify({
    business_context: compactText(businessContext),
    items: aiCandidates,
  });
}

export function parseRefinements(text: string): SitemapRefinement[] {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed?.items)) return [];
    return parsed.items
      .filter((item: any) => typeof item?.index === 'number')
      .map((item: any) => ({
        index: item.index,
        section: compactText(item.section),
        sub_section_or_category: compactText(item.sub_section_or_category),
        page_title: compactText(item.page_title),
        ...(item.slug_and_path ? { slug_and_path: normalizePath(item.slug_and_path, item.page_title || 'page') } : {}),
      }))
      .filter((item) => item.section && item.page_title);
  } catch {
    return [];
  }
}

export function applyRefinements(
  sections: SitemapSection[],
  refinements: SitemapRefinement[],
): SitemapSection[] {
  if (!refinements.length) return sections;

  const next = [...sections];
  for (const refinement of refinements) {
    const current = next[refinement.index];
    if (!current) continue;
    const section = normalizeSection(refinement.section, current.section);

    next[refinement.index] = {
      ...current,
      section,
      sub_section_or_category: refinement.sub_section_or_category || current.sub_section_or_category,
      page_title: refinement.page_title,
      slug_and_path: refinement.slug_and_path || current.slug_and_path,
      conversion_potential:
        section === PRICE_SECTION || section === PRODUCT_SECTION
          ? 'High'
          : section === SERVICE_SECTION
          ? 'Medium'
          : section === BLOG_SECTION
          ? 'Low'
          : current.conversion_potential,
    };
  }

  return next;
}
