export interface KeywordExpansionJobRequest {
  projectId?: string;
  seedKeywords: string[];
  competitorDomains: string[];
  clientWebsites?: string[];
  locationName?: string;
  seedLimitPerPage?: number;
  competitorLimitPerPage?: number;
  competitorTopRank?: number;
}

export interface SeedKeywordResponse {
  success: boolean;
  seeds: string[];
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
  source_count?: number;
  source_refs: string[];
}

export interface KeywordExpansionResult {
  summary: KeywordExpansionSummary;
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
