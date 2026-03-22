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
