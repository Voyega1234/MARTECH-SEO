import { supabase } from '../../lib/supabase';

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
  total_seed_rows: number;
  total_competitor_rows: number;
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
