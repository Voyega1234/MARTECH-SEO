-- Step 2 database schema
-- Root business context stays in `seo_projects`.
-- This schema stores one or more keyword expansion runs under each project.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
