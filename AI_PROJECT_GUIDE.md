# MARTECH-SEO AI Project Guide

This file is written for an AI agent that needs to understand, modify, debug, or extend this project without relying on tribal knowledge.

It is intentionally more detailed than the main README.

## 1. Project Purpose

`MARTECH-SEO` is an SEO workflow application with a React frontend and an Express backend.

Its main responsibilities are:

1. Collect business context.
2. Generate or expand keyword opportunities.
3. Filter keyword relevance.
4. Build keyword grouping outputs for SEO URL planning.
5. Generate sitemap and PAA-style blog ideas.

In practical usage, the project currently behaves like a multi-step SEO planning workbench:

1. Step 1: Define business context and initial seed ideas.
2. Step 2: Expand keywords through a separate FastAPI service.
3. Step 3: Group keywords into URL-worthy SEO topics.
4. Step 4: Use the grouping result for sitemap and content ideation.

## 2. High-Level Runtime Architecture

There are two server-side runtimes involved:

### A. Main app

- Frontend: React + Vite
- Backend: Express + TypeScript
- Default dev ports:
  - frontend: `3000`
  - backend: `3001`

Main backend entrypoint:
- [server/index.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/index.ts)

### B. Step 2 expansion service

- Separate FastAPI prototype
- Default port: `8010`

Reference:
- [step2_api/README.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/step2_api/README.md)

The frontend talks to both:

- Step 2 API for large-scale keyword expansion
- Step 3 API (`/api/keywords`) for planning, grouping, filtering, and content ideation

## 3. Important Design Reality

The project contains both:

- older/general generation flows
- newer structured Step 2 / Step 3 workflows

The most actively iterated area is `Step 3 preview grouping`.

Do not assume all flows are equally polished.
Some parts of the repo are stable, some are experimental, and some were cleaned recently but still reflect past iterations.

## 4. Repo Map

### Frontend

- [src/App.tsx](/Users/waveconvertcake/Desktop/MARTECH-SEO/src/App.tsx)
- [src/services/api.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/src/services/api.ts)
- [src/features/keyword-expansion/api.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/src/features/keyword-expansion/api.ts)

### Express backend

- [server/index.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/index.ts)
- [server/routes/keywords.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/routes/keywords.ts)
- [server/routes/sitemap.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/routes/sitemap.ts)

### Shared parsing / schemas / grouping utilities

- [shared/claudeStructuredSchemas.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/claudeStructuredSchemas.ts)
- [shared/keywordGroupingOutput.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/keywordGroupingOutput.ts)
- [shared/keywordGroupingPlan.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/keywordGroupingPlan.ts)
- [shared/paaBlog.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/paaBlog.ts)
- [shared/sitemapGenerator.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/sitemapGenerator.ts)

### Prompt files

- [prompt/Keyword_grouping_blueprint.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_blueprint.md)
- [prompt/Keyword_grouping_preview_assignment.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_preview_assignment.md)
- [prompt/Keyword_grouping_plan.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_plan.md)
- [prompt/Keyword_grouping_groups.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_groups.md)
- [prompt/Keyword_grouping_repair.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_repair.md)
- [prompt/Keyword_grouping_merge_review.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_merge_review.md)
- [prompt/Keyword_generator.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_generator.md)
- [prompt/SeedKeyword_generator.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/SeedKeyword_generator.md)
- [prompt/Keyword_relevance_filter.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_relevance_filter.md)
- [prompt/Keyword_sitemap.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_sitemap.md)
- [prompt/PAA_blog_seed_selection.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/PAA_blog_seed_selection.md)
- [prompt/PAA_blog_ideas.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/PAA_blog_ideas.md)

## 5. Local Run Commands

From [package.json](/Users/waveconvertcake/Desktop/MARTECH-SEO/package.json):

```bash
npm run dev
npm run dev:server
npm run dev:all
npm run lint
```

Notes:

- `npm run dev:all` starts both Express and Vite.
- Step 2 FastAPI is separate and must be started independently.
- The root README is minimal and partially outdated; this guide is the better source of truth.

## 6. Environment and Providers

Main backend uses:

- Gemini via [server/services/geminiText.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/services/geminiText.ts)
- Anthropic via [server/services/agent.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/services/agent.ts)

Important environment variables include:

- `GEMINI_API_KEY`
- `KEYWORD_GROUPING_PREVIEW_PROVIDER`
- `KEYWORD_GROUPING_PREVIEW_MODEL`
- `CLAUDE_MODEL`
- DFS credentials for Step 2 / SERP functionality

Preview model selection currently comes from:
- `getKeywordGroupingPreviewModelSelection()` in [server/services/geminiText.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/services/geminiText.ts)

Important current default:

- Preview builder default model: `gemini-3.1-pro-preview`

Assignment currently overrides that inside [server/routes/keywords.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/routes/keywords.ts), so do not assume builder and assignment always use the same model.

## 7. Main Backend Endpoints

Defined mainly in [server/routes/keywords.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/routes/keywords.ts)

### Core keyword endpoints

- `POST /api/keywords/generate`
- `POST /api/keywords/seeds`
- `POST /api/keywords/grouping-plan`
- `POST /api/keywords/grouping-jobs`
- `GET /api/keywords/grouping-jobs/:jobId`
- `POST /api/keywords/grouping-final`
- `POST /api/keywords/relevance-filter`
- `POST /api/keywords/paa-blog-jobs`
- `GET /api/keywords/paa-blog-jobs/:jobId`
- `POST /api/keywords/stream`

### Sitemap endpoint

Defined in [server/routes/sitemap.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/routes/sitemap.ts)

- `POST /api/sitemap/generate`

## 8. Frontend-to-Backend Integration

Frontend service wrappers:

- [src/services/api.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/src/services/api.ts)
- [src/features/keyword-expansion/api.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/src/features/keyword-expansion/api.ts)

Important split:

- Step 2 expansion calls go to `http://127.0.0.1:8010` in dev.
- Step 3 grouping/filtering calls go to `/api/keywords`.

This separation matters when debugging:

- a Step 2 issue is usually not a Step 3 issue
- a Step 3 grouping bug is usually inside the Express app, not FastAPI

## 9. Functional Workflow Overview

### Step 1: Business context and seeds

Purpose:

- Define the SEO/business context
- Generate seed keywords

Relevant files:

- [prompt/SeedKeyword_generator.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/SeedKeyword_generator.md)
- [server/routes/keywords.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/routes/keywords.ts)
- [shared/seedKeywords.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/seedKeywords.ts)

### Step 2: Keyword expansion

Purpose:

- Expand keywords using DataForSEO suggestions
- Pull competitor domain organic keywords
- Pull client website organic keywords

Runs via FastAPI:

- [step2_api/README.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/step2_api/README.md)

Important output shape:

- flat keyword list
- `search_volume`
- provenance references

### Step 2.5: Relevance filtering

Purpose:

- Remove obviously irrelevant terms before grouping

Relevant files:

- [prompt/Keyword_relevance_filter.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_relevance_filter.md)
- [server/routes/keywords.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/routes/keywords.ts)
- [shared/claudeStructuredSchemas.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/claudeStructuredSchemas.ts)

### Step 3: Keyword grouping

This is the most important and most iterated part of the project.

There are two different Step 3 modes:

1. `preview_only = true`
2. full/final grouping

These are related but not identical.

## 10. Step 3 Active Workflow

This is now the primary Step 3 grouping workflow.

Defined in [server/routes/keywords.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/routes/keywords.ts)

It is used by:

1. `preview_only = true` grouping jobs
2. the main `preview_only = false` grouping jobs
3. `POST /api/keywords/grouping-final`

The shared helper is:

- `runUnifiedGroupingWorkflow(formData, keywords)`

Current flow:

1. Build a grouping blueprint.
2. Assign keywords into those approved groups.
3. Re-check leftovers.
4. Run embeddings on remaining leftovers only.
5. Add `Needs Review / Ungrouped` for anything still unmatched.

### Step 3 Builder

Function:

- `generateGroupingBlueprint(formData, keywords)`

Prompt:

- [prompt/Keyword_grouping_blueprint.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_blueprint.md)

Schema:

- `getKeywordGroupingBlueprintJsonSchema()` in [shared/claudeStructuredSchemas.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/claudeStructuredSchemas.ts)

Input:

- business name
- website
- business description
- SEO goals
- priority keywords
- focus product lines
- target market
- keyword demand landscape with volumes

Output shape:

```json
{
  "groups": [
    {
      "product_line": "...",
      "topic_pillar": "...",
      "intent": "C",
      "keyword_group": "...",
      "slug": "/example/"
    }
  ]
}
```

Post-processing:

- normalizes slugs
- de-duplicates slugs
- drops low-value/noise groups
- initializes `keywords: []`

Builder debug files:

- `/tmp/martech-seo-debug/preview-group-builder-last-request.json`
- `/tmp/martech-seo-debug/preview-group-builder-last-response.json`

### Step 3 Assignment

Function:

- `assignKeywordsToPreviewGroups(formData, groups, keywords)`

Prompt:

- [prompt/Keyword_grouping_preview_assignment.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_preview_assignment.md)

Schema:

- `getKeywordGroupingPreviewAssignmentJsonSchema()` in [shared/claudeStructuredSchemas.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/claudeStructuredSchemas.ts)

#### Current assignment design

Important current facts:

- assignment does **not** send business context anymore
- assignment only sees:
  - target market
  - approved groups
  - sample keywords already inside each group
  - current keyword batch

Current intention:

- decide by page-fit and group-fit
- avoid forcing keywords into groups just because of surface similarity

#### Current assignment model behavior

The assignment stage is explicitly overridden in [server/routes/keywords.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/routes/keywords.ts).

At the time this guide was written:

- assignment provider = `anthropic`
- assignment model = `claude-sonnet-4-6`
- assignment temperatures = `0.2, 0.5`

Do not assume this stays constant. Check the function directly.

#### Assignment batching and rounds

Current constants:

- `MAX_PREVIEW_ASSIGNMENT_KEYWORDS_PER_BATCH = 100`
- `MAX_PREVIEW_ASSIGNMENT_ROUNDS = 2`

How it works:

1. All groups start with empty `keywords`.
2. Assignment Pass 1 runs across the full keyword list in batches of 100.
3. Only after that full pass finishes are leftovers collected.
4. Leftovers are re-checked in one additional AI round.
5. Later rounds include `sample keywords` from already assigned groups.
6. Loop stops when:
   - nothing remains, or
   - remaining count no longer improves, or
   - 2 rounds are reached

#### Embedding leftover pass

After the AI rounds finish:

1. remaining unmatched keywords are embedded
2. approved group descriptors are embedded
3. cosine similarity is computed
4. leftover keywords are assigned only if score is above the threshold

Current threshold:

- `PREVIEW_ASSIGNMENT_EMBEDDING_THRESHOLD = 0.85`

This means embeddings are a cleanup pass, not the primary grouping method.

#### Assignment input format

Generated by `buildPreviewAssignmentUserMessage(...)`.

Each group is rendered like:

```text
G0: product_line | pillar | intent | keyword_group | slug | sample keywords: ...
```

Each keyword is rendered like:

```text
K0: keyword | search_volume
```

#### Assignment output format

Expected JSON:

```json
{
  "assignments": [
    { "g": 0, "k": [0, 1, 2] }
  ]
}
```

Meaning:

- `g` = group index
- `k` = keyword indexes within that current batch

#### Assignment debug files

- `/tmp/martech-seo-debug/preview-group-assignment-last-request.json`
- `/tmp/martech-seo-debug/preview-group-assignment-last-response.json`

### Ungrouped logic

After assignment, the project calls:

- `ensureKeywordGroupingCoverage(...)`

Defined in:
- [shared/keywordGroupingOutput.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/keywordGroupingOutput.ts)

What it does:

1. Collect all keywords already seen inside groups.
2. Compare them against the full input keyword list.
3. Append a global fallback group if anything is still missing.

Fallback group:

- `Product Line = Needs Review`
- `Topic Pillar = Ungrouped`
- `Keyword Group = Ungrouped Keywords`
- `slug = /needs-review-global/`

This means:

- unassigned keywords are never silently dropped
- they are surfaced explicitly in output

## 11. Legacy Step 3 Structured Flow

Relevant endpoints:

- `POST /api/keywords/grouping-plan`
- `POST /api/keywords/grouping-final`

This older structured flow still exists in the codebase, but it is no longer the active main grouping path for job execution or `grouping-final`.

### Legacy grouping plan

Prompt:

- [prompt/Keyword_grouping_plan.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_plan.md)

Goal:

- infer product lines and topic pillars first

Schema:

- `getKeywordGroupingPlanJsonSchema()`

### Legacy grouping batches

Prompt:

- [prompt/Keyword_grouping_groups.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_groups.md)

Schema:

- `getKeywordGroupingBatchJsonSchema()`

Flow:

1. chunk keywords
2. group each batch into `groups`
3. parse and validate
4. repair malformed batches if needed
5. merge all batches
6. repair `Needs Review` groups
7. merge similar groups
8. enforce keyword coverage again

Supporting prompts:

- [prompt/Keyword_grouping_repair.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_repair.md)
- [prompt/Keyword_grouping_merge_review.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_merge_review.md)

Treat this as legacy/reference logic unless you are explicitly reviving it.

## 12. PAA Blog Flow

Purpose:

- generate PAA and related-search blog ideas from the latest keyword map

Endpoints:

- `POST /api/keywords/paa-blog-jobs`
- `GET /api/keywords/paa-blog-jobs/:jobId`

Main pieces:

- seed selection prompt
- SERP collection
- idea synthesis
- cannibalization filtering

Relevant files:

- [prompt/PAA_blog_seed_selection.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/PAA_blog_seed_selection.md)
- [prompt/PAA_blog_ideas.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/PAA_blog_ideas.md)
- [shared/paaBlog.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/paaBlog.ts)

## 13. Sitemap Flow

Primary sitemap route:

- [server/routes/sitemap.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/routes/sitemap.ts)

Flow:

1. Try heuristic sitemap generation first via [shared/sitemapGenerator.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/sitemapGenerator.ts)
2. If needed, ask AI only to refine candidate sections
3. If heuristic path fails, fall back to full AI sitemap generation

Important point:

- sitemap generation is more hybrid/heuristic than Step 3 grouping

## 14. Current Prompt Philosophy

A very important project rule emerged during Step 3 iteration:

### Do not hardcode one business

The system should not contain rigid business-specific logic such as:

- “if this is lighting, always do X”
- “if keyword contains Y, always exclude it”

Instead, prompts should use:

- business model
- offering type
- SEO objectives
- project scope

Generic business-model heuristics are allowed.
Hardcoded niche rules are not.

## 15. Important Lessons From Recent Step 3 Iteration

These are practical project truths, not abstract theory.

### A. Multi-stage preview became too complex

Several preview experiments were tried:

- prefilter first
- cluster-first reverse flow
- JSON cluster membership
- group naming after clustering
- AI reassignment loops

Main conclusion:

- too many stages made coverage unstable
- debug became harder
- keywords disappeared between stages

### B. Single-pass preview builder worked better

The simpler preview builder:

- generated clearer topic maps
- reduced architectural instability
- made debugging more straightforward

### C. Assignment is now the main bottleneck

Current builder is much better than it was.

Current main problem:

- assignment quality
- over-assigning broad groups
- leaving some strategically important leftovers ungrouped

### D. More rounds do not solve missing coverage

Iterative assignment helps only when a keyword is already close to a good fit.

It does not create:

- new groups
- new page concepts
- better coverage by itself

If a keyword has no good home, 5 rounds will not magically fix that.

## 16. Known Pain Points

As of this guide:

1. Preview assignment can still over-assign by surface similarity.
2. Giant buckets still happen, especially in broad product families.
3. `Ungrouped` is partly valid and partly a sign of missing coverage.
4. Some builder-created groups can remain empty after assignment.
5. Brand/corporate groups can still appear even when product/topic groups are more important.

## 17. Debugging Checklist

When Step 3 output looks wrong, inspect in this order:

1. Builder request/response:
   - `/tmp/martech-seo-debug/preview-group-builder-last-request.json`
   - `/tmp/martech-seo-debug/preview-group-builder-last-response.json`
2. Assignment request/response:
   - `/tmp/martech-seo-debug/preview-group-assignment-last-request.json`
   - `/tmp/martech-seo-debug/preview-group-assignment-last-response.json`
3. `raw` field returned by the job API
4. `Needs Review / Ungrouped` size and composition

Useful questions:

1. Did builder create the right groups?
2. Did assignment ignore a good group?
3. Did assignment stuff too much into a broad group?
4. Are leftovers truly off-scope, or just uncovered?

## 18. Recommended Reading Order For Another AI

If you are a new AI agent entering this repo, read in this order:

1. [AI_PROJECT_GUIDE.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/AI_PROJECT_GUIDE.md)
2. [package.json](/Users/waveconvertcake/Desktop/MARTECH-SEO/package.json)
3. [server/index.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/index.ts)
4. [server/routes/keywords.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/server/routes/keywords.ts)
5. [shared/keywordGroupingOutput.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/keywordGroupingOutput.ts)
6. [shared/claudeStructuredSchemas.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/shared/claudeStructuredSchemas.ts)
7. [prompt/Keyword_grouping_blueprint.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_blueprint.md)
8. [prompt/Keyword_grouping_preview_assignment.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/prompt/Keyword_grouping_preview_assignment.md)
9. [src/features/keyword-expansion/api.ts](/Users/waveconvertcake/Desktop/MARTECH-SEO/src/features/keyword-expansion/api.ts)
10. [step2_api/README.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/step2_api/README.md)

## 19. Safe Modification Strategy

When changing this project, prefer this order:

1. inspect prompt behavior
2. inspect raw/debug files
3. change the smallest stage possible
4. run `npm run lint`
5. retest with the same keyword set

Do not immediately redesign the whole pipeline unless there is strong evidence the architecture itself is the problem.

For Step 3 preview work specifically:

- change builder and assignment separately when possible
- avoid reintroducing unnecessary multi-stage complexity
- keep debugging observable via `/tmp/martech-seo-debug`

## 20. Bottom Line

This project is an SEO planning system with a real separation between:

- business context
- keyword expansion
- relevance filtering
- grouping
- sitemap/content planning

The most sensitive area is Step 3.

The current project direction is:

- keep preview builder relatively simple
- keep assignment explicit and inspectable
- avoid business-specific hardcoding
- preserve leftovers in `Needs Review` rather than silently dropping them

If you are changing Step 3, assume that:

- grouping quality matters more than clever architecture
- assignment mistakes are currently more damaging than small under-assignment
- visibility and debuggability are first-class requirements
