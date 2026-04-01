import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const promptDir = path.resolve(__dirname, '../../prompt');

export function loadPrompt(filename: string): string {
  return fs.readFileSync(path.join(promptDir, filename), 'utf-8');
}

export function getKeywordGeneratorPrompt(): string {
  return loadPrompt('Keyword_generator.md');
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

export function getKeywordGroupingGroupsPrompt(): string {
  return loadPrompt('Keyword_grouping_groups.md');
}

export function getKeywordGroupingNamesPrompt(): string {
  return loadPrompt('Keyword_grouping_names.md');
}

export function getKeywordRelevanceFilterPrompt(): string {
  return loadPrompt('Keyword_relevance_filter.md');
}

export function getKeywordGroupingRepairPrompt(): string {
  return loadPrompt('Keyword_grouping_repair.md');
}

export function getKeywordGroupingMergeReviewPrompt(): string {
  return loadPrompt('Keyword_grouping_merge_review.md');
}
