# MARTECH-SEO AI Project Guide

Last updated: 2026-04-17

This is the canonical project guide for AI agents working on `MARTECH-SEO`.

`WORKFLOW_REDESIGN.md` was removed because the redesign is no longer just a target spec. The new topic/sitemap-first workflow is now the main product flow, so this file is the source of truth.

## 1. Current Product Purpose

`MARTECH-SEO` is an SEO strategy workflow app for generating a Thai-first SEO site architecture from business context, keyword demand, and sitemap-level matching.

The current default workflow is:

1. Business Context
2. Generate Topic Universe
3. Generate Sitemap
4. Generate Seeds from Sitemap
5. Expand Keywords from Seeds
6. Match Keywords to Sitemap

The old keyword-first workflow is no longer the main path:

1. Seed Keywords
2. Expanded Keywords
3. Grouping Plan

Those old flows can still exist in code for compatibility, but future work should treat them as legacy unless the user explicitly asks for them.

## 2. Language Rule

Primary user-facing output should be Thai.

Use English only when it is more natural or required:

- brand names
- URL slugs
- model names
- technical terms commonly used in English
- English search queries that appear in keyword data

Tables, labels, prompts, and generated SEO artifacts should lean Thai-first because the target users are Thai teams.

## 3. Runtime Architecture

There are two runtimes.

### Main app

- Frontend: React + Vite
- Backend: Express + TypeScript
- Dev frontend: `http://127.0.0.1:3000`
- Dev backend: `http://127.0.0.1:3001`

Main files:

- [server/index.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/index.ts)
- [server/routes/keywords.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/routes/keywords.ts)
- [src/NewApp.tsx](/Users/waveconvertcake/Desktop/MARTECH-SEO/src/NewApp.tsx)
- [src/components/StrategyWorkspace.tsx](/Users/waveconvertcake/Desktop/MARTECH-SEO/src/components/StrategyWorkspace.tsx)
- [src/features/keyword-expansion/api.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/src/features/keyword-expansion/api.ts)

### Step 2 keyword expansion service

- Separate FastAPI service
- Dev URL: `http://127.0.0.1:8010`
- Used by the `Expand Keywords from Seeds` step

Main file:

- [step2_api/app.py](/Users/waveconvertcake/Desktop/MARTECH-SEO/step2_api/app.py)

Reference:

- [step2_api/README.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/step2_api/README.md)

If `Expand Keywords from Seeds` fails with `Failed to fetch`, first check whether the FastAPI service is running.

## 4. Local Commands

From [package.json](/Users/waveconvertcake/Desktop/MARTECH-SEO/package.json):

```bash
npm run dev
npm run dev:server
npm run dev:all
npm run lint
```

Start Step 2 separately:

```bash
.venv/bin/uvicorn step2_api.app:app --reload --port 8010
```

Always run this after TypeScript changes:

```bash
npm run lint
```

## 5. Current Workflow Details

### Step 1: Business Context

Purpose:

- collect the business name, website, business description, SEO goals, focus areas, priority keywords, and target market
- act as the context object for all later steps

UI behavior:

- after project selection, the app should open the Business Context panel
- the generate button belongs at the bottom of the Business Context page
- running generation should move the user forward into Topic Universe

Business context should not be sent to every downstream process by default if the step does not need it. For example, old keyword assignment was intentionally simplified to avoid over-conditioning on business context.

### Step 2: Generate Topic Universe

Purpose:

- map every distinct topic area customers search for
- create the strategic coverage checklist before building sitemap pages

Endpoint:

- `POST /api/keywords/topic-universe`

Prompt:

- [prompt/Topic_universe.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Topic_universe.md)

Shared module:

- [shared/topicUniverse.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/topicUniverse.ts)

Input:

- `formData`

Output:

- `rows`
- `csv`
- `row_count`

Expected row shape:

```ts
type TopicUniverseRow = {
  index: number;
  dimension_name: string;
  what_it_covers: string;
  example_search_queries: string[];
  primary_intent: 'T' | 'C' | 'I' | 'N';
};
```

Important rule:

- Topic Universe rows are dimensions and user needs, not final keyword groups.

### Step 3: Generate Sitemap

Purpose:

- convert Topic Universe into site architecture
- create planned pages before keyword API expansion

Endpoint:

- `POST /api/keywords/sitemap-from-universe`

Prompt:

- [prompt/Sitemap_from_topic_universe.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Sitemap_from_topic_universe.md)

Shared module:

- [shared/sitemapRows.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/sitemapRows.ts)

Input:

- `formData`
- Topic Universe rows

Output:

- `rows`
- `csv`
- `row_count`

Expected row shape:

```ts
type SitemapRow = {
  section: string;
  sub_section_or_category: string;
  page_title: string;
  slug_and_path: string;
  dimension_name: string | null;
  page_type: string;
  keyword_group: string | '—';
  l3_suggested_keywords: string[] | '—';
  source: 'topic_page' | 'business_page';
};
```

UI note:

- `source` is internal metadata.
- The visible Strategy workflow table should not show `Source`.

### Step 4: Generate Seeds from Sitemap

Purpose:

- generate root seeds after sitemap exists
- prove which sitemap rows are covered by seeds
- mark business/support pages as intentionally unseeded when appropriate

Endpoint:

- `POST /api/keywords/seeds-from-sitemap`

Prompt:

- [prompt/Seed_from_sitemap.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Seed_from_sitemap.md)

Shared module:

- [shared/sitemapSeeds.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/sitemapSeeds.ts)

Input:

- `formData`
- sitemap rows

Output:

- `seeds`
- `coverage`
- `csv`
- `seed_count`
- `coverage_row_count`

Important rules:

- seeds should be root-level terms, not every modifier
- no seed should contain another seed when spaces are ignored
- Thai and English variants may coexist if both are meaningful
- sitemap rows may remain intentionally unseeded with a reason

### Step 5: Expand Keywords from Seeds

Purpose:

- send approved sitemap-derived seeds to the Step 2 FastAPI keyword API
- produce a flat keyword list with search volumes

Frontend API wrapper:

- `createKeywordExpansionJob(...)` in [src/features/keyword-expansion/api.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/src/features/keyword-expansion/api.ts)

Step 2 endpoint:

- `POST http://127.0.0.1:8010/jobs/expand`

Current Strategy workflow input:

- `seedPlan.result.seeds`
- `locationName` from business context
- `competitorDomains: []`
- `clientWebsites: []`
- `persistRawKeywords: false`

Current output used by the UI:

- keyword
- search volume
- job summary and API call count

The Step 2 service may still return provenance metadata internally, but the Strategy workflow table no longer shows:

- `Source`
- `Source Refs`

Filter/save behavior:

- users can filter expanded keywords by text query
- users can set minimum search volume
- users can click `Save Filter for Matching`
- the saved filtered keyword set becomes the input for Step 6
- if no filtered set is saved, the full expanded keyword list is used

Relevant state bridge:

- [src/components/StrategyWorkspace.tsx](/Users/waveconvertcake/Desktop/MARTECH-SEO/src/components/StrategyWorkspace.tsx)
- [src/NewApp.tsx](/Users/waveconvertcake/Desktop/MARTECH-SEO/src/NewApp.tsx)

### Step 6: Match Keywords to Sitemap

Purpose:

- match expanded keywords to sitemap rows
- populate `Keyword Group`, `L3 Keywords Top 5`, and `Matched Keywords`
- report unmatched keywords
- add new sitemap rows when keyword data reveals real missing topics

Endpoint:

- `POST /api/keywords/match-to-sitemap`

Prompt:

- [prompt/Keyword_to_sitemap_matching.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_to_sitemap_matching.md)

Shared module:

- [shared/sitemapMatching.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/sitemapMatching.ts)

Input:

- `formData`
- sitemap rows
- saved filtered keyword set from Step 5, or all expanded keywords if no filter was saved

Output:

- updated sitemap rows
- top keywords per row
- matched keywords per row
- matching notes
- row origin
- unmatched keywords
- CSV

Visible table columns:

- Section
- Sub-section
- Page Title
- Slug
- Dimension
- Page Type
- Keyword Group
- L3 Keywords Top 5
- Matched Keywords
- Matching Note
- Origin

Visible table should not show:

- `Source`
- `Source Refs`

## 6. Main Frontend State and Navigation

The current default workspace is `strategy`.

Main workflow shell:

- [src/NewApp.tsx](/Users/waveconvertcake/Desktop/MARTECH-SEO/src/NewApp.tsx)

Main step component:

- [src/components/StrategyWorkspace.tsx](/Users/waveconvertcake/Desktop/MARTECH-SEO/src/components/StrategyWorkspace.tsx)

Active Strategy panels:

```ts
type StrategyPanel =
  | 'business'
  | 'topic-universe'
  | 'sitemap'
  | 'seeds-from-sitemap'
  | 'expand-from-seeds'
  | 'matching';
```

Sidebar labels:

1. Business Context
2. Generate Topic Universe
3. Generate Sitemap
4. Generate Seeds from Sitemap
5. Expand Keywords from Seeds
6. Match Keywords to Sitemap

Do not reintroduce these old sidebar labels as the main flow:

- Seed Keywords
- Expanded Keywords
- Grouping Plan

## 7. Backend Model Usage

### Current new Strategy endpoints

The new Strategy endpoints use `generateOnly(...)` from:

- [server/services/agent.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/services/agent.ts)

Default model behavior:

- `CLAUDE_MODEL` if set
- otherwise `claude-sonnet-4-6`

The current new Strategy steps are Claude-backed unless explicitly changed.

### Legacy preview assignment

Legacy keyword grouping preview assignment still exists in:

- [server/routes/keywords.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/routes/keywords.ts)

Current assignment model:

- `claude-sonnet-4-6`

Current assignment temperatures:

- `0.2`
- `0.5`

Current assignment rounds:

- maximum 2 assignment passes
- later ungrouped recheck happens only after the previous pass has processed all keywords

This is legacy behavior and should not be confused with the new sitemap matching workflow.

### Gemini usage

Gemini helper still exists:

- [server/services/geminiText.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/services/geminiText.ts)

Use it only where the code path explicitly calls the Gemini helper or where environment config selects Gemini for a legacy flow.

## 8. Important Prompt Files

Current Strategy prompts:

- [prompt/Topic_universe.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Topic_universe.md)
- [prompt/Sitemap_from_topic_universe.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Sitemap_from_topic_universe.md)
- [prompt/Seed_from_sitemap.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Seed_from_sitemap.md)
- [prompt/Keyword_to_sitemap_matching.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_to_sitemap_matching.md)

Legacy grouping prompts:

- [prompt/Keyword_grouping_blueprint.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_blueprint.md)
- [prompt/Keyword_grouping_preview_assignment.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_preview_assignment.md)
- [prompt/Keyword_grouping_plan.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_plan.md)
- [prompt/Keyword_grouping_groups.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_groups.md)

Legacy prompts can stay for compatibility, but they are not the default user flow.

## 9. Shared Modules

Current Strategy shared modules:

- [shared/topicUniverse.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/topicUniverse.ts)
- [shared/sitemapRows.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/sitemapRows.ts)
- [shared/sitemapSeeds.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/sitemapSeeds.ts)
- [shared/sitemapMatching.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/sitemapMatching.ts)
- [shared/claudeStructuredSchemas.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/claudeStructuredSchemas.ts)

These modules handle:

- type definitions
- JSON parsing
- schema validation helpers
- CSV rendering

## 10. API Wrapper Map

Frontend wrappers live in:

- [src/features/keyword-expansion/api.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/src/features/keyword-expansion/api.ts)

Current Strategy wrappers:

- `generateTopicUniverse(formData)`
- `generateSitemapFromUniverse(formData, topicUniverse)`
- `generateSeedsFromSitemap(formData, sitemapRows)`
- `createKeywordExpansionJob(input)`
- `getKeywordExpansionJob(jobId)`
- `getKeywordExpansionResult(jobId)`
- `getKeywordExpansionCsvUrl(jobId)`
- `matchKeywordsToSitemap(formData, sitemapRows, keywords)`

Step 2 base URL behavior:

- dev: `http://127.0.0.1:8010`
- prod/default env: `VITE_STEP2_API_BASE_URL`

Step 3 base URL behavior:

- dev: `/api/keywords`
- prod/default env: `VITE_STEP3_API_BASE_URL`

## 11. Product Rules That Should Not Be Broken

Do not hardcode one business.

Bad:

- if business is lighting, always add these groups
- if keyword contains a specific Thai word, always assign it to a fixed page
- fixed rules tailored only to Ligman

Allowed:

- generic business-model heuristics
- prompt rules based on offering type, target market, page intent, and SEO objectives
- reusable page-fit logic

Other core rules:

- sitemap comes before keyword matching
- seed generation comes after sitemap
- business pages can exist without keyword demand
- unmatched keywords should be surfaced, not silently dropped
- matching should prefer page intent over surface similarity
- visible Strategy tables should stay clean and not expose internal provenance columns unless explicitly requested

## 12. DataForSEO / Keyword API Responsibility

DataForSEO usage belongs to the Step 2 FastAPI expansion service, not the new Express Strategy endpoints.

The current pipeline is:

1. Strategy Step 4 creates seeds from sitemap.
2. Strategy Step 5 sends seeds to Step 2 FastAPI.
3. Step 2 expands keywords through the keyword API.
4. Strategy Step 5 receives a flat keyword list.
5. User filters and saves the keyword list.
6. Strategy Step 6 matches the saved keyword set to sitemap rows.

If keyword API expansion fails:

- check `http://127.0.0.1:8010`
- check Step 2 API credentials
- check Step 2 logs
- do not debug the Express matching endpoint first

## 13. Current UI Output Expectations

Topic Universe table should show:

- Dimension
- What It Covers
- Intent
- Example Search Queries

Sitemap table should show:

- Section
- Sub-section
- Page Title
- Slug
- Dimension
- Page Type
- Keyword Group
- L3 Suggested Keywords

Expanded Keywords table should show:

- Keyword
- Search Volume

Expanded Keywords table should include:

- keyword text filter
- minimum search volume filter
- `Save Filter for Matching`

Matching table should show:

- Section
- Sub-section
- Page Title
- Slug
- Dimension
- Page Type
- Keyword Group
- L3 Keywords Top 5
- Matched Keywords
- Matching Note
- Origin

Do not show these columns in Strategy workflow tables:

- `Source`
- `Source Refs`

## 14. Debugging Checklist

When the app is blank after selecting a project:

1. Check that `activeWorkspace` is `strategy`.
2. Check that `activePanel` is set to `business`.
3. Inspect [src/NewApp.tsx](/Users/waveconvertcake/Desktop/MARTECH-SEO/src/NewApp.tsx).

When Topic Universe/Sitemap/Seeds/Matching fails:

1. Check Express backend logs.
2. Check [server/routes/keywords.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/routes/keywords.ts).
3. Check `ANTHROPIC_API_KEY`.
4. Check `CLAUDE_MODEL` only if model selection is suspected.
5. Run `npm run lint`.

When Expand Keywords from Seeds fails:

1. Check whether Step 2 FastAPI is running on port `8010`.
2. Check Step 2 API credentials.
3. Check the request body from [src/components/StrategyWorkspace.tsx](/Users/waveconvertcake/Desktop/MARTECH-SEO/src/components/StrategyWorkspace.tsx).
4. Do not assume this is an Express backend error.

When matching quality is bad:

1. Check whether the user saved an overly broad or overly narrow expansion filter.
2. Check whether sitemap rows are too broad.
3. Check [prompt/Keyword_to_sitemap_matching.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_to_sitemap_matching.md).
4. Check [shared/sitemapMatching.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/sitemapMatching.ts).

When old grouping behavior appears:

1. Confirm the UI is not using a legacy panel.
2. Confirm `StrategyWorkspace` is the active workspace.
3. Do not patch legacy grouping unless the task explicitly targets it.

## 15. Implementation Guidance for Future AI Agents

Before editing:

1. Read this guide.
2. Inspect the exact files involved.
3. Avoid assuming old keyword grouping is still the main product.

While editing:

- keep UI labels Thai-first where appropriate
- preserve the topic/sitemap-first workflow
- keep Step 2 expansion separate from Express strategy generation
- do not expose internal provenance columns in the Strategy tables unless requested
- do not hardcode for Ligman or any single business

After editing:

- run `npm run lint`
- summarize what changed
- mention anything not verified

