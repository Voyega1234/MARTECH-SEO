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
