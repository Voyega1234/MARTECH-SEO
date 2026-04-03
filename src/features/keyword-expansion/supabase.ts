import { supabase } from '../../lib/supabase';
import type {
  KeywordExpansionKeywordRow,
  KeywordExpansionResult,
  KeywordGroupingFinalResponse,
} from './types';
import { renderKeywordGroupingCsv } from '../../../shared/keywordGroupingOutput.ts';

const SUPABASE_PAGE_SIZE = 1000;
const SUPABASE_MUTATION_CHUNK_SIZE = 500;

export interface KeywordExpansionRunRow {
  id: string;
  project_id: string;
  location_name: string;
  language_code: string;
  seed_limit_per_page: number;
  competitor_limit_per_page: number;
  competitor_top_rank: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  total_seed_keywords: number;
  total_competitor_domains: number;
  total_client_websites?: number;
  total_seed_rows: number;
  total_competitor_rows: number;
  total_client_website_rows?: number;
  deduped_keywords: number;
  total_api_calls: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KeywordSeedRunHistoryRow {
  id: string;
  project_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  total_seed_keywords: number;
  deduped_keywords: number;
  total_api_calls: number;
  created_at: string;
  seeds: string[];
}

interface KeywordGroupingRunRow {
  id: string;
  project_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  input_keyword_count: number;
  covered_keyword_count: number;
  group_count: number;
  batch_count: number;
  csv_text: string | null;
  raw_output: string | null;
  created_at: string;
}

function normalizeSlug(value: string): string {
  const slug = value.trim();
  if (!slug) return '/needs-review/';
  const withLeadingSlash = slug.startsWith('/') ? slug : `/${slug}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function makeUniqueSlug(slug: string, seen: Set<string>): string {
  const normalized = normalizeSlug(slug);
  if (!seen.has(normalized)) {
    seen.add(normalized);
    return normalized;
  }

  const base = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  let suffix = 2;
  while (true) {
    const candidate = `${base}-${suffix}/`;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      return candidate;
    }
    suffix += 1;
  }
}

export async function listKeywordExpansionRuns(
  projectId: string
): Promise<KeywordExpansionRunRow[]> {
  const { data, error } = await supabase
    .from('keyword_expansion_runs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load keyword expansion runs: ${error.message}`);
  }

  return data || [];
}

export async function listKeywordSeedRuns(
  projectId: string
): Promise<KeywordSeedRunHistoryRow[]> {
  const { data: runs, error: runsError } = await supabase
    .from('keyword_expansion_runs')
    .select('id, project_id, status, total_seed_keywords, deduped_keywords, total_api_calls, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (runsError) {
    throw new Error(`Failed to load seed runs: ${runsError.message}`);
  }

  if (!runs?.length) return [];

  const runIds = runs.map((run) => run.id);
  const { data: seeds, error: seedsError } = await supabase
    .from('keyword_expansion_seeds')
    .select('run_id, seed_index, seed_keyword')
    .eq('project_id', projectId)
    .in('run_id', runIds)
    .order('seed_index', { ascending: true });

  if (seedsError) {
    throw new Error(`Failed to load seed keywords: ${seedsError.message}`);
  }

  const seedMap = new Map<string, string[]>();
  for (const seed of seeds || []) {
    const current = seedMap.get(seed.run_id) || [];
    current.push(seed.seed_keyword);
    seedMap.set(seed.run_id, current);
  }

  return runs.map((run) => ({
    ...run,
    seeds: seedMap.get(run.id) || [],
  }));
}

function buildCatalogFromSources(
  sources: Array<{ source_type: string; source_index: number; source_value: string }>
) {
  const s: string[] = [];
  const c: string[] = [];
  const w: string[] = [];

  for (const source of sources) {
    if (source.source_type === 'seed') s[source.source_index] = source.source_value;
    if (source.source_type === 'competitor') c[source.source_index] = source.source_value;
    if (source.source_type === 'client_website') w[source.source_index] = source.source_value;
  }

  return {
    s: s.filter((value) => typeof value === 'string'),
    c: c.filter((value) => typeof value === 'string'),
    w: w.filter((value) => typeof value === 'string'),
  };
}

async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => any
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) {
      throw error;
    }

    const page = (data || []) as T[];
    rows.push(...page);

    if (page.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function loadLatestKeywordExpansionResult(
  projectId: string
): Promise<KeywordExpansionResult | null> {
  const { data: run, error: runError } = await supabase
    .from('keyword_expansion_runs')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) {
    throw new Error(`Failed to load latest keyword expansion run: ${runError.message}`);
  }

  if (!run) return null;

  const [keywordRows, sourceRows, seedRows] = await Promise.all([
    fetchAllRows<any>((from, to) =>
      supabase
        .from('keyword_expansion_keywords_with_sources')
        .select('*')
        .eq('run_id', run.id)
        .order('search_volume', { ascending: false, nullsFirst: false })
        .range(from, to)
    ).catch((error) => {
      throw new Error(`Failed to load latest keyword rows: ${error.message}`);
    }),
    fetchAllRows<{
      source_type: string;
      source_index: number;
      source_value: string;
    }>((from, to) =>
      supabase
        .from('keyword_expansion_keyword_sources')
        .select('source_type, source_index, source_value')
        .eq('run_id', run.id)
        .order('source_index', { ascending: true })
        .range(from, to)
    ).catch((error) => {
      throw new Error(`Failed to load latest keyword sources: ${error.message}`);
    }),
    fetchAllRows<{
      seed_index: number;
      seed_keyword: string;
    }>((from, to) =>
      supabase
        .from('keyword_expansion_seeds')
        .select('seed_index, seed_keyword')
        .eq('run_id', run.id)
        .order('seed_index', { ascending: true })
        .range(from, to)
    ).catch((error) => {
      throw new Error(`Failed to load latest seed keywords: ${error.message}`);
    }),
  ]);

  const sourceCatalogFromSources = buildCatalogFromSources(sourceRows as Array<{
    source_type: string;
    source_index: number;
    source_value: string;
  }>);
  const sourceCatalog = {
    s: seedRows.map((row) => row.seed_keyword),
    c: sourceCatalogFromSources.c,
    w: sourceCatalogFromSources.w,
  };
  const competitorSourceRows = sourceRows.filter((source) => source.source_type === 'competitor').length;
  const clientWebsiteSourceRows = sourceRows.filter((source) => source.source_type === 'client_website').length;

  const keywords = keywordRows.map((row: any) => {
    const sources = Array.isArray(row.sources) ? row.sources : [];
    const competitorRanks = sources
      .filter((source: any) => source?.source_type === 'competitor' && typeof source?.rank_group === 'number')
      .map((source: any) => source.rank_group as number);
    const competitorAbsoluteRanks = sources
      .filter((source: any) => source?.source_type === 'competitor' && typeof source?.rank_absolute === 'number')
      .map((source: any) => source.rank_absolute as number);
    const clientRanks = sources
      .filter((source: any) => source?.source_type === 'client_website' && typeof source?.rank_group === 'number')
      .map((source: any) => source.rank_group as number);
    const clientAbsoluteRanks = sources
      .filter((source: any) => source?.source_type === 'client_website' && typeof source?.rank_absolute === 'number')
      .map((source: any) => source.rank_absolute as number);

    return {
      keyword: row.keyword,
      search_volume: typeof row.search_volume === 'number' ? row.search_volume : '-',
      volume_source: row.volume_source,
      latest_monthly_search_volume: row.latest_monthly_search_volume,
      cpc: row.cpc,
      competition: row.competition,
      low_top_of_page_bid: row.low_top_of_page_bid,
      high_top_of_page_bid: row.high_top_of_page_bid,
      best_competitor_rank_group: competitorRanks.length ? Math.min(...competitorRanks) : null,
      best_competitor_rank_absolute: competitorAbsoluteRanks.length ? Math.min(...competitorAbsoluteRanks) : null,
      best_client_website_rank_group: clientRanks.length ? Math.min(...clientRanks) : null,
      best_client_website_rank_absolute: clientAbsoluteRanks.length ? Math.min(...clientAbsoluteRanks) : null,
      source_count: row.source_ref_count || sources.length || 0,
      source_refs: sources
        .map((source: any) => {
          if (source?.source_type === 'seed') return `s${source.source_index}`;
          if (source?.source_type === 'competitor') return `c${source.source_index}`;
          if (source?.source_type === 'client_website') return `w${source.source_index}`;
          return null;
        })
        .filter(Boolean),
    };
  });

  if (!keywords.length) {
    return null;
  }

  return {
    summary: {
      total_seed_keywords: run.total_seed_keywords || 0,
      total_competitor_domains: run.total_competitor_domains || sourceCatalog.c.length,
      total_client_websites: run.total_client_websites || sourceCatalog.w.length,
      total_seed_rows: run.total_seed_rows || 0,
      total_competitor_rows: run.total_competitor_rows || competitorSourceRows,
      total_client_website_rows: run.total_client_website_rows || clientWebsiteSourceRows,
      deduped_keywords: run.deduped_keywords || keywords.length,
      total_api_calls: run.total_api_calls || 0,
    },
    metadata: {
      relevant_keyword_count:
        typeof (run as any).relevant_keyword_count === 'number'
          ? (run as any).relevant_keyword_count
          : keywords.length,
    },
    source_catalog: sourceCatalog,
    keywords,
  };
}

export async function pruneLatestKeywordExpansionRunToRelevant(
  projectId: string,
  keywords: KeywordExpansionKeywordRow[]
): Promise<void> {
  const { data: run, error: runError } = await supabase
    .from('keyword_expansion_runs')
    .select('id')
    .eq('project_id', projectId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) {
    throw new Error(`Failed to load latest keyword expansion run for pruning: ${runError.message}`);
  }

  if (!run) return;

  const keywordRows = await fetchAllRows<{ id: string; normalized_keyword: string }>((from, to) =>
    supabase
      .from('keyword_expansion_keywords')
      .select('id, normalized_keyword')
      .eq('run_id', run.id)
      .range(from, to)
  ).catch((error) => {
    throw new Error(`Failed to load latest keyword ids for pruning: ${error.message}`);
  });

  const keepNormalized = new Set(
    keywords
      .map((row) => row.keyword.trim().toLowerCase().replace(/\s+/g, ''))
      .filter(Boolean)
  );

  const deleteIds = keywordRows
    .filter((row) => !keepNormalized.has(row.normalized_keyword))
    .map((row) => row.id);

  for (const batch of chunkArray(deleteIds, SUPABASE_MUTATION_CHUNK_SIZE)) {
    const { error: deleteError } = await supabase
      .from('keyword_expansion_keywords')
      .delete()
      .in('id', batch);

    if (deleteError) {
      throw new Error(`Failed to prune non-relevant keywords: ${deleteError.message}`);
    }
  }

  const baseRunPayload = {
    deduped_keywords: keywords.length,
  };

  const { error: updateError } = await supabase
    .from('keyword_expansion_runs')
    .update({
      ...baseRunPayload,
      relevant_keyword_count: keywords.length,
    } as any)
    .eq('id', run.id);

  if (updateError) {
    const { error: fallbackUpdateError } = await supabase
      .from('keyword_expansion_runs')
      .update(baseRunPayload)
      .eq('id', run.id);

    if (fallbackUpdateError) {
      throw new Error(`Failed to update latest keyword expansion run after pruning: ${fallbackUpdateError.message}`);
    }
  }
}

export async function saveKeywordGroupingResult(
  projectId: string,
  response: KeywordGroupingFinalResponse
): Promise<void> {
  const seenSlugs = new Set<string>();
  const groups = response.result.groups.map((group) => ({
    ...group,
    slug: makeUniqueSlug(group.slug, seenSlugs),
  }));
  const csvText = renderKeywordGroupingCsv(groups);

  const runPayload = {
    project_id: projectId,
    status: 'completed',
    input_keyword_count: response.result.input_keyword_count,
    covered_keyword_count: response.result.covered_keyword_count,
    group_count: response.result.group_count,
    batch_count: response.result.batch_count,
    csv_text: csvText,
    raw_output: response.raw,
  };

  const { data: run, error: runError } = await supabase
    .from('keyword_grouping_runs')
    .insert(runPayload)
    .select('id')
    .single();

  if (runError) {
    throw new Error(`Failed to save keyword grouping run: ${runError.message}`);
  }

  const groupRows = groups.map((group, groupIndex) => ({
    run_id: run.id,
    project_id: projectId,
    group_index: groupIndex,
    product_line: group.product_line,
    pillar: group.pillar,
    intent: group.intent,
    keyword_group: group.keyword_group,
    slug: group.slug,
    keyword_count: group.keywords.length,
  }));

  const { data: insertedGroups, error: groupsError } = await supabase
    .from('keyword_grouping_groups')
    .insert(groupRows)
    .select('id, group_index');

  if (groupsError) {
    throw new Error(`Failed to save keyword grouping groups: ${groupsError.message}`);
  }

  const groupIdByIndex = new Map<number, string>();
  for (const row of insertedGroups || []) {
    if (typeof row.group_index === 'number' && typeof row.id === 'string') {
      groupIdByIndex.set(row.group_index, row.id);
    }
  }

  const keywordRows = groups.flatMap((group, groupIndex) => {
    const groupId = groupIdByIndex.get(groupIndex);
    if (!groupId) return [];
    return group.keywords.map((keyword, keywordIndex) => ({
      run_id: run.id,
      group_id: groupId,
      project_id: projectId,
      keyword_index: keywordIndex,
      keyword: keyword.keyword,
      normalized_keyword: keyword.keyword.trim().toLowerCase(),
      search_volume: typeof keyword.search_volume === 'number' ? keyword.search_volume : null,
    }));
  });

  if (keywordRows.length) {
    const { error: keywordsError } = await supabase
      .from('keyword_grouping_group_keywords')
      .insert(keywordRows);

    if (keywordsError) {
      throw new Error(`Failed to save keyword grouping keywords: ${keywordsError.message}`);
    }
  }
}

export async function clearKeywordWorkflowRuns(projectId: string): Promise<void> {
  const { error: groupingError } = await supabase
    .from('keyword_grouping_runs')
    .delete()
    .eq('project_id', projectId);

  if (groupingError) {
    throw new Error(`Failed to clear keyword grouping runs: ${groupingError.message}`);
  }

  const { error: expansionError } = await supabase
    .from('keyword_expansion_runs')
    .delete()
    .eq('project_id', projectId);

  if (expansionError) {
    throw new Error(`Failed to clear keyword expansion runs: ${expansionError.message}`);
  }
}

export async function loadLatestKeywordGroupingResult(
  projectId: string
): Promise<KeywordGroupingFinalResponse | null> {
  const { data: run, error: runError } = await supabase
    .from('keyword_grouping_runs')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) {
    throw new Error(`Failed to load latest keyword grouping run: ${runError.message}`);
  }

  if (!run) return null;

  const [groupRows, keywordRows] = await Promise.all([
    fetchAllRows<any>((from, to) =>
      supabase
        .from('keyword_grouping_groups')
        .select('*')
        .eq('run_id', run.id)
        .order('group_index', { ascending: true })
        .range(from, to)
    ).catch((error) => {
      throw new Error(`Failed to load latest keyword grouping groups: ${error.message}`);
    }),
    fetchAllRows<any>((from, to) =>
      supabase
        .from('keyword_grouping_group_keywords')
        .select('*')
        .eq('run_id', run.id)
        .order('group_id', { ascending: true })
        .order('keyword_index', { ascending: true })
        .range(from, to)
    ).catch((error) => {
      throw new Error(`Failed to load latest keyword grouping keywords: ${error.message}`);
    }),
  ]);

  const keywordsByGroupId = new Map<string, Array<{ keyword: string; search_volume: number | '-' }>>();
  for (const row of keywordRows || []) {
    if (!row?.group_id || !row?.keyword) continue;
    const current = keywordsByGroupId.get(row.group_id) || [];
    current.push({
      keyword: row.keyword,
      search_volume: typeof row.search_volume === 'number' ? row.search_volume : '-',
    });
    keywordsByGroupId.set(row.group_id, current);
  }

  return {
    success: true,
    result: {
      groups: (groupRows || []).map((group: any) => ({
        product_line: group.product_line,
        pillar: group.pillar,
        intent: group.intent,
        keyword_group: group.keyword_group,
        slug: group.slug,
        keywords: keywordsByGroupId.get(group.id) || [],
      })),
      csv: run.csv_text || '',
      group_count: run.group_count || 0,
      covered_keyword_count: run.covered_keyword_count || 0,
      input_keyword_count: run.input_keyword_count || 0,
      batch_count: run.batch_count || 0,
    },
    raw: run.raw_output || '',
  };
}
