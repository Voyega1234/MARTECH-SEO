# Keyword Volume Fix Plan

## Context

The current keyword generation flow allows the LLM to output `volume` values directly in the final JSON. This makes the keyword table vulnerable to incorrect search volumes when the model guesses, expands beyond DataForSEO results, or outputs keywords that were not returned by DFS.

## Current Problems

1. `KeywordTable` renders from `keywordResult`, which comes from the agent JSON output.
2. The current prompt still allows the model to:
   - invent a small number of synonym or typo keywords
   - assign `"-"` to those invented keywords
   - generate 100-200 keyword groups even if DFS data is not sufficient
3. `verifyDashVolumes` only patches keywords whose volume is `"-"`.
4. If the model outputs an incorrect numeric volume, the current verifier does not overwrite it.
5. The system prompt and app flow still treat LLM output as the source of truth for search volume.

## Root Cause

The architecture mixes two responsibilities:

- the LLM is doing clustering, naming, grouping, and slug generation
- the LLM is also effectively authoring numeric search volume values

Numeric keyword volume should not come from the LLM. It should come only from DataForSEO.

## Required Fix Direction

### 1. Prompt changes

Update `prompt/Keyword_generator.md` so the model:

- must not invent any `volume` values
- must not output numeric search volume values from memory or estimation
- should focus on structure only:
  - product lines
  - topic pillars
  - keyword groups
  - keywords
  - slugs
- should either omit `volume` entirely or set it to `null`
- must not invent keywords outside DFS results unless explicitly allowed by product requirements

### 2. Backend flow changes

After the agent returns keyword structure:

1. Extract every keyword from all groups
2. Deduplicate keywords
3. Call DataForSEO `keywords_data/google_ads/search_volume/live`
4. Map `search_volume` back onto every keyword
5. Build the final JSON on the backend
6. Return only backend-verified volume values to the frontend

This makes DataForSEO the source of truth for all displayed volumes.

### 3. Verifier changes

The current verifier should evolve from:

- patch only `"-"` values

to:

- resolve volume for every keyword in the final structure
- overwrite any LLM-provided value with DFS data
- use `"-"` only when DFS returns `0`, `null`, or no matching result

### 4. UI assumptions

`KeywordTable` should continue rendering `keywordResult`, but after the backend changes, `keywordResult` must already be fully verified.

The UI should not be responsible for validating or correcting search volume values.

## Implementation Order

1. Backup current prompt
2. Tighten `prompt/Keyword_generator.md`
3. Change backend keyword generation flow so volumes are resolved after clustering
4. Update verifier to handle all keywords, not only `"-"`
5. Test with known DFS keywords such as `jim thompson`
6. Confirm server logs show:
   - total keywords extracted
   - total deduplicated keywords
   - total DFS matches
   - total patched or assigned volumes

## Expected End State

- The model is used for clustering and SEO structure only
- DataForSEO is the only authority for search volume
- The keyword table can no longer display guessed numeric volumes from the LLM
- `"-"` appears only when DFS truly has no usable volume for the keyword

## Notes

- Existing saved projects in Supabase may still contain previously generated incorrect volumes.
- After the fix, old projects may need regeneration if accurate volume values are required.
