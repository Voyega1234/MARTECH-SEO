-- =========================================================
-- Step 3 Database Schema for Supabase
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
-- Step 3: Grouping runs table
-- One project can have multiple step-3 runs
-- =========================================================
create table if not exists keyword_grouping_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references seo_projects(id) on delete cascade,
  status text not null default 'completed' check (status in ('queued', 'running', 'completed', 'failed')),
  input_keyword_count integer not null default 0,
  covered_keyword_count integer not null default 0,
  group_count integer not null default 0,
  batch_count integer not null default 0,
  csv_text text,
  raw_output text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists keyword_grouping_runs_project_id_idx
  on keyword_grouping_runs(project_id, created_at desc);

drop trigger if exists keyword_grouping_runs_set_updated_at on keyword_grouping_runs;

create trigger keyword_grouping_runs_set_updated_at
before update on keyword_grouping_runs
for each row execute function set_updated_at();


-- =========================================================
-- Step 4: Final groups table
-- Stores one row per final keyword group
-- =========================================================
create table if not exists keyword_grouping_groups (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references keyword_grouping_runs(id) on delete cascade,
  project_id uuid not null references seo_projects(id) on delete cascade,
  group_index integer not null,
  product_line text not null,
  pillar text not null,
  intent text not null check (intent in ('T', 'C', 'I', 'N')),
  keyword_group text not null,
  slug text not null,
  keyword_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (run_id, group_index),
  unique (run_id, slug)
);

create index if not exists keyword_grouping_groups_project_id_idx
  on keyword_grouping_groups(project_id);

create index if not exists keyword_grouping_groups_run_id_idx
  on keyword_grouping_groups(run_id, group_index);


-- =========================================================
-- Step 5: Group keywords table
-- Stores the Level 3 keyword variations inside each final group
-- =========================================================
create table if not exists keyword_grouping_group_keywords (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references keyword_grouping_runs(id) on delete cascade,
  group_id uuid not null references keyword_grouping_groups(id) on delete cascade,
  project_id uuid not null references seo_projects(id) on delete cascade,
  keyword_index integer not null,
  keyword text not null,
  normalized_keyword text not null,
  search_volume integer,
  created_at timestamptz not null default now(),
  unique (group_id, keyword_index)
);

create index if not exists keyword_grouping_group_keywords_group_id_idx
  on keyword_grouping_group_keywords(group_id, keyword_index);

create index if not exists keyword_grouping_group_keywords_project_id_idx
  on keyword_grouping_group_keywords(project_id);


-- =========================================================
-- Step 6: Optional helper view
-- Lets you inspect one run with groups and keywords together
-- =========================================================
create or replace view keyword_grouping_groups_with_keywords as
select
  g.id,
  g.run_id,
  g.project_id,
  g.group_index,
  g.product_line,
  g.pillar,
  g.intent,
  g.keyword_group,
  g.slug,
  g.keyword_count,
  g.created_at,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'keyword_index', k.keyword_index,
        'keyword', k.keyword,
        'search_volume', k.search_volume
      )
      order by k.keyword_index
    ) filter (where k.id is not null),
    '[]'::jsonb
  ) as keywords
from keyword_grouping_groups g
left join keyword_grouping_group_keywords k
  on k.group_id = g.id
group by
  g.id,
  g.run_id,
  g.project_id,
  g.group_index,
  g.product_line,
  g.pillar,
  g.intent,
  g.keyword_group,
  g.slug,
  g.keyword_count,
  g.created_at;
