export interface KeywordExpansionJobRequest {
  projectId?: string;
  seedKeywords: string[];
  competitorDomains: string[];
  clientWebsites?: string[];
  locationName?: string;
  seedLimitPerPage?: number;
  competitorLimitPerPage?: number;
  competitorTopRank?: number;
  persistRawKeywords?: boolean;
}

export interface SeedKeywordResponse {
  success: boolean;
  seeds: string[];
  raw: string;
}

export interface KeywordRelevanceFilterResponse {
  success: boolean;
  relevant_keywords: KeywordExpansionKeywordRow[];
  input_keyword_count: number;
  relevant_keyword_count: number;
  batch_count: number;
  raw: string;
}

export interface KeywordExpansionJobCreated {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
}

export interface KeywordExpansionJobProgress {
  phase: string;
  total_seed_keywords: number;
  completed_seed_keywords: number;
  total_competitor_domains: number;
  completed_competitor_domains: number;
  total_client_websites: number;
  completed_client_websites: number;
  total_api_calls: number;
  current_item: string | null;
  message: string | null;
}

export interface KeywordExpansionSummary {
  total_seed_keywords: number;
  total_competitor_domains: number;
  total_client_websites: number;
  total_seed_rows: number;
  total_competitor_rows: number;
  total_client_website_rows: number;
  deduped_keywords: number;
  total_api_calls: number;
}

export interface KeywordExpansionKeywordRow {
  keyword: string;
  search_volume: number | '-';
  volume_source?: string | null;
  latest_monthly_search_volume?: number | null;
  cpc?: number | null;
  competition?: number | null;
  low_top_of_page_bid?: number | null;
  high_top_of_page_bid?: number | null;
  best_competitor_rank_group?: number | null;
  best_competitor_rank_absolute?: number | null;
  best_client_website_rank_group?: number | null;
  best_client_website_rank_absolute?: number | null;
  source_count?: number;
  source_refs: string[];
}

export interface KeywordExpansionResult {
  summary: KeywordExpansionSummary;
  metadata?: {
    relevant_keyword_count?: number;
  };
  source_catalog: {
    s: string[];
    c: string[];
    w: string[];
  };
  keywords: KeywordExpansionKeywordRow[];
}

export interface KeywordExpansionJob {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  progress: KeywordExpansionJobProgress;
  error: string | null;
  result?: KeywordExpansionResult;
}

export type KeywordGroupingPlanIntent = 'T' | 'C' | 'I' | 'N';

export interface KeywordGroupingPlanPillar {
  name: string;
  intent: KeywordGroupingPlanIntent;
}

export interface KeywordGroupingPlanProductLine {
  name: string;
  pillars: KeywordGroupingPlanPillar[];
}

export interface KeywordGroupingPlan {
  product_lines: KeywordGroupingPlanProductLine[];
}

export interface KeywordGroupingPlanResponse {
  success: boolean;
  plan: KeywordGroupingPlan;
  raw: string;
  input_keyword_count: number;
  used_keyword_count: number;
  truncated: boolean;
  batch_count?: number;
}

export interface KeywordGroupingFinalGroupKeyword {
  keyword: string;
  search_volume: number | '-';
}

export interface KeywordGroupingFinalGroup {
  product_line: string;
  pillar: string;
  intent: KeywordGroupingPlanIntent;
  keyword_group: string;
  slug: string;
  keywords: KeywordGroupingFinalGroupKeyword[];
}

export interface KeywordGroupingFinalResultPayload {
  preview_only?: boolean;
  groups: KeywordGroupingFinalGroup[];
  csv: string;
  group_count: number;
  covered_keyword_count: number;
  input_keyword_count: number;
  batch_count: number;
}

export interface KeywordGroupingFinalResponse {
  success: boolean;
  result: KeywordGroupingFinalResultPayload;
  raw: string;
}

export interface KeywordGroupingJobCreated {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  preview_only?: boolean;
}

export interface KeywordGroupingJobProgress {
  phase: string;
  total_plan_batches: number;
  completed_plan_batches: number;
  total_final_batches: number;
  completed_final_batches: number;
  current_batch: number | null;
  input_keyword_count: number;
  message: string | null;
}

export interface KeywordGroupingJobDetail {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  preview_only?: boolean;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  progress: KeywordGroupingJobProgress;
  error: string | null;
  plan?: KeywordGroupingPlan;
  plan_raw?: string | null;
  result?: KeywordGroupingFinalResultPayload;
  raw?: string | null;
}

export interface PaaBlogIdeaRow {
  blog_title: string;
  source: 'PAA' | 'Related Search';
  source_seed: string;
  programmatic_variables: string;
}

export interface PaaBlogCollectedEntry {
  query: string;
  source: 'PAA' | 'Related Search';
  source_seed: string;
  seed_language: 'th' | 'en';
}

export interface PaaBlogSeedPlan {
  thai_seeds: string[];
  english_seeds: string[];
}

export interface PaaBlogResultPayload {
  seed_plan: PaaBlogSeedPlan;
  collected_entries: PaaBlogCollectedEntry[];
  ideas: PaaBlogIdeaRow[];
  collected_entry_count: number;
  idea_count: number;
  keyword_map_group_count: number;
}

export interface PaaBlogJobCreated {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
}

export interface PaaBlogJobProgress {
  phase: 'queued' | 'seed_selection' | 'collecting_thai' | 'collecting_english' | 'finalizing' | 'completed' | 'failed';
  total_serp_calls: number;
  completed_serp_calls: number;
  current_seed: string | null;
  message: string | null;
}

export interface PaaBlogJobDetail {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  progress: PaaBlogJobProgress;
  error: string | null;
  result?: PaaBlogResultPayload;
  raw?: string | null;
}
