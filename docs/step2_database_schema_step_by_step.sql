-- =========================================================
-- Step 2 Database Schema for Supabase
-- Run in order, step by step
-- Root table assumed to already exist: seo_projects
-- =========================================================

-- =========================================================
-- Step 1: Enable pgcrypto for UUID generation
-- =========================================================
create extension if not exists pgcrypto;


-- =========================================================
-- Step 2: Shared updated_at trigger function
-- =========================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =========================================================
-- Step 3: Expansion runs table
-- One project can have multiple step-2 runs
-- =========================================================
create table if not exists keyword_expansion_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references seo_projects(id) on delete cascade,
  location_name text not null default 'Thailand',
  language_code text not null default 'th',
  seed_limit_per_page integer not null default 500 check (seed_limit_per_page between 1 and 1000),
  competitor_limit_per_page integer not null default 200 check (competitor_limit_per_page between 1 and 1000),
  competitor_top_rank integer not null default 10 check (competitor_top_rank between 1 and 100),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  total_seed_keywords integer not null default 0,
  total_competitor_domains integer not null default 0,
  total_client_websites integer not null default 0,
  total_seed_rows integer not null default 0,
  total_competitor_rows integer not null default 0,
  total_client_website_rows integer not null default 0,
  deduped_keywords integer not null default 0,
  total_api_calls integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists keyword_expansion_runs_project_id_idx
  on keyword_expansion_runs(project_id, created_at desc);

drop trigger if exists keyword_expansion_runs_set_updated_at on keyword_expansion_runs;

create trigger keyword_expansion_runs_set_updated_at
before update on keyword_expansion_runs
for each row execute function set_updated_at();


-- =========================================================
-- Step 4: Seed keywords table
-- Stores the ordered seed list used in a run
-- =========================================================
create table if not exists keyword_expansion_seeds (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references keyword_expansion_runs(id) on delete cascade,
  project_id uuid not null references seo_projects(id) on delete cascade,
  seed_index integer not null,
  seed_keyword text not null,
  normalized_seed_keyword text generated always as (lower(regexp_replace(seed_keyword, '\s+', '', 'g'))) stored,
  created_at timestamptz not null default now(),
  unique (run_id, seed_index),
  unique (run_id, normalized_seed_keyword)
);

create index if not exists keyword_expansion_seeds_project_id_idx
  on keyword_expansion_seeds(project_id);


-- =========================================================
-- Step 5: Competitor domains table
-- Stores the ordered competitor list used in a run
-- =========================================================
create table if not exists keyword_expansion_competitors (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references keyword_expansion_runs(id) on delete cascade,
  project_id uuid not null references seo_projects(id) on delete cascade,
  competitor_index integer not null,
  domain text not null,
  normalized_domain text generated always as (lower(domain)) stored,
  created_at timestamptz not null default now(),
  unique (run_id, competitor_index),
  unique (run_id, normalized_domain)
);

create index if not exists keyword_expansion_competitors_project_id_idx
  on keyword_expansion_competitors(project_id);


-- =========================================================
-- Step 6: Expanded keyword table
-- Stores the final deduped keyword output for a run
-- =========================================================
create table if not exists keyword_expansion_keywords (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references keyword_expansion_runs(id) on delete cascade,
  project_id uuid not null references seo_projects(id) on delete cascade,
  keyword text not null,
  normalized_keyword text not null,
  search_volume integer,
  latest_monthly_search_volume integer,
  volume_source text not null default 'missing'
    check (volume_source in ('search_volume', 'monthly_searches', 'missing')),
  cpc numeric(12, 4),
  competition numeric(12, 4),
  low_top_of_page_bid numeric(12, 4),
  high_top_of_page_bid numeric(12, 4),
  monthly_searches_json jsonb,
  source_ref_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, normalized_keyword)
);

create index if not exists keyword_expansion_keywords_project_id_idx
  on keyword_expansion_keywords(project_id);

create index if not exists keyword_expansion_keywords_run_id_volume_idx
  on keyword_expansion_keywords(run_id, search_volume desc nulls last);

drop trigger if exists keyword_expansion_keywords_set_updated_at on keyword_expansion_keywords;

create trigger keyword_expansion_keywords_set_updated_at
before update on keyword_expansion_keywords
for each row execute function set_updated_at();


-- =========================================================
-- Step 7: Keyword source mapping table
-- Tracks which seed / competitor each keyword came from
-- =========================================================
create table if not exists keyword_expansion_keyword_sources (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references keyword_expansion_runs(id) on delete cascade,
  project_id uuid not null references seo_projects(id) on delete cascade,
  keyword_id uuid not null references keyword_expansion_keywords(id) on delete cascade,
  source_type text not null check (source_type in ('seed', 'competitor', 'client_website')),
  source_index integer not null,
  source_value text not null,
  rank_group integer,
  rank_absolute integer,
  created_at timestamptz not null default now(),
  unique (run_id, keyword_id, source_type, source_index)
);

create index if not exists keyword_expansion_keyword_sources_keyword_id_idx
  on keyword_expansion_keyword_sources(keyword_id);

create index if not exists keyword_expansion_keyword_sources_run_id_idx
  on keyword_expansion_keyword_sources(run_id, source_type, source_index);


-- =========================================================
-- Step 8: Optional helper view
-- Lets you inspect one run with readable source details
-- =========================================================
create or replace view keyword_expansion_keywords_with_sources as
select
  k.id,
  k.run_id,
  k.project_id,
  k.keyword,
  k.normalized_keyword,
  k.search_volume,
  k.latest_monthly_search_volume,
  k.volume_source,
  k.cpc,
  k.competition,
  k.low_top_of_page_bid,
  k.high_top_of_page_bid,
  k.monthly_searches_json,
  k.source_ref_count,
  k.created_at,
  k.updated_at,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source_type', s.source_type,
        'source_index', s.source_index,
        'source_value', s.source_value,
        'rank_group', s.rank_group,
        'rank_absolute', s.rank_absolute
      )
    ) filter (where s.id is not null),
    '[]'::jsonb
  ) as sources
from keyword_expansion_keywords k
left join keyword_expansion_keyword_sources s
  on s.keyword_id = k.id
group by
  k.id,
  k.run_id,
  k.project_id,
  k.keyword,
  k.normalized_keyword,
  k.search_volume,
  k.latest_monthly_search_volume,
  k.volume_source,
  k.cpc,
  k.competition,
  k.low_top_of_page_bid,
  k.high_top_of_page_bid,
  k.monthly_searches_json,
  k.source_ref_count,
  k.created_at,
  k.updated_at;
