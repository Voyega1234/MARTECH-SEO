import fs from 'fs';
import path from 'path';

const promptDir = path.join(process.cwd(), 'prompt');

export function loadPrompt(filename: string): string {
  return fs.readFileSync(path.join(promptDir, filename), 'utf-8');
}

export function getKeywordGeneratorPrompt(): string {
  return loadPrompt('Keyword_generator.md');
}

export function getTopicUniversePrompt(): string {
  return loadPrompt('Topic_universe.md');
}

export function getSitemapFromTopicUniversePrompt(): string {
  return loadPrompt('Sitemap_from_topic_universe.md');
}

export function getSeedFromSitemapPrompt(): string {
  return loadPrompt('Seed_from_sitemap.md');
}

export function getKeywordToSitemapMatchingPrompt(): string {
  return loadPrompt('Keyword_to_sitemap_matching.md');
}

export function getSitemapPrompt(): string {
  return loadPrompt('Keyword_sitemap.md');
}

export function getSeedKeywordPrompt(): string {
  return loadPrompt('SeedKeyword_generator.md');
}

export function getKeywordGroupingPlanPrompt(): string {
  return loadPrompt('Keyword_grouping_plan.md');
}

export function getKeywordGroupingBlueprintPrompt(): string {
  return loadPrompt('Keyword_grouping_blueprint.md');
}

export function getKeywordGroupingPreviewAssignmentPrompt(): string {
  return loadPrompt('Keyword_grouping_preview_assignment.md');
}

export function getKeywordRelevanceFilterPrompt(): string {
  return loadPrompt('Keyword_relevance_filter.md');
}
