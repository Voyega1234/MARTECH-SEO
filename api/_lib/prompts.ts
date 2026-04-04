import fs from 'fs';
import path from 'path';

const promptDir = path.join(process.cwd(), 'prompt');

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

export function getKeywordGroupingPreviewClustersPrompt(): string {
  return loadPrompt('Keyword_grouping_preview_clusters.md');
}

export function getKeywordGroupingPreviewClusterNamesPrompt(): string {
  return loadPrompt('Keyword_grouping_preview_cluster_names.md');
}

export function getKeywordGroupingPreviewAssignmentPrompt(): string {
  return loadPrompt('Keyword_grouping_preview_assignment.md');
}

export function getKeywordGroupingPreviewValidationPrompt(): string {
  return loadPrompt('Keyword_grouping_preview_validation.md');
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
