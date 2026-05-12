import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AgentError, generateOnly } from '../_lib/agent.js';
import { fetchGoogleOrganicSerpFeatures } from '../_lib/dfsSerp.js';
import {
  getPaaBlogIdeasPrompt,
  getPaaBlogSeedSelectionPrompt,
} from '../_lib/prompts.js';
import {
  buildKeywordMapReference,
  dedupeCollectedEntries,
  filterCannibalizingIdeas,
  normalizePaaText,
  type PaaCollectedEntry,
  type PaaIdeaRow,
  type PaaKeywordMap,
  type PaaSeedPlan,
} from '../../shared/paaBlog.js';
import {
  getPaaBlogIdeasJsonSchema,
  getPaaSeedSelectionJsonSchema,
} from '../../shared/claudeStructuredSchemas.ts';

function nowIso() {
  return new Date().toISOString();
}

function randomJobId() {
  return globalThis.crypto?.randomUUID?.() || `paa-${Date.now()}`;
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  if (start < 0) {
    throw new Error('Could not find a valid JSON object in PAA output.');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(start, index + 1);
      }
    }
  }

  throw new Error('Could not find a complete JSON object in PAA output.');
}

function buildPaaSeedSelectionUserMessage(
  formData: Record<string, any>,
  keywordMap: PaaKeywordMap | null
): string {
  const parts: string[] = [];
  parts.push(`Business Name: ${formData.businessName || 'N/A'}`);
  parts.push(`Website URL: ${formData.websiteUrl || 'N/A'}`);
  parts.push(`Business Description & Core Offerings: ${formData.businessDescription || 'N/A'}`);
  parts.push(`SEO Goals & Conversion Action: ${formData.seoGoals || 'N/A'}`);
  if (formData.mustRankKeywords?.length) {
    parts.push(`Priority Keywords:\n${formData.mustRankKeywords.map((k: string) => `- ${k}`).join('\n')}`);
  }
  if (formData.focusProductLines?.length) {
    parts.push(`Focus Product Lines:\n${formData.focusProductLines.map((p: string) => `- ${p}`).join('\n')}`);
  }
  parts.push(`Keyword Map Summary:\n${buildKeywordMapReference(keywordMap)}`);
  return parts.join('\n\n');
}

function parsePaaSeedPlan(raw: string): PaaSeedPlan {
  const parsed = JSON.parse(extractJsonObject(raw));
  const thaiSeeds: string[] = Array.isArray(parsed?.thai_seeds)
    ? parsed.thai_seeds.map((item: unknown) => normalizePaaText(String(item))).filter(Boolean)
    : [];
  const englishSeeds: string[] = Array.isArray(parsed?.english_seeds)
    ? parsed.english_seeds.map((item: unknown) => normalizePaaText(String(item))).filter(Boolean)
    : [];

  const uniqueThai = [...new Set(thaiSeeds)];
  const uniqueEnglish = [...new Set(englishSeeds)];

  if (uniqueThai.length < 10 || uniqueEnglish.length < 10) {
    throw new Error('PAA seed selection did not return 10 Thai and 10 English seeds.');
  }

  return {
    thai_seeds: uniqueThai.slice(0, 10),
    english_seeds: uniqueEnglish.slice(0, 10),
  };
}

function buildPaaIdeasUserMessage(
  formData: Record<string, any>,
  keywordMap: PaaKeywordMap | null,
  seedPlan: PaaSeedPlan,
  collectedEntries: PaaCollectedEntry[]
): string {
  const parts: string[] = [];
  parts.push(`Business Name: ${formData.businessName || 'N/A'}`);
  parts.push(`Website URL: ${formData.websiteUrl || 'N/A'}`);
  parts.push(`Business Description & Core Offerings: ${formData.businessDescription || 'N/A'}`);
  parts.push(`SEO Goals & Conversion Action: ${formData.seoGoals || 'N/A'}`);
  if (formData.mustRankKeywords?.length) {
    parts.push(`Priority Keywords:\n${formData.mustRankKeywords.map((k: string) => `- ${k}`).join('\n')}`);
  }
  if (formData.focusProductLines?.length) {
    parts.push(`Focus Product Lines:\n${formData.focusProductLines.map((p: string) => `- ${p}`).join('\n')}`);
  }
  parts.push(`Thai Seeds:\n${seedPlan.thai_seeds.map((seed) => `- ${seed}`).join('\n')}`);
  parts.push(`English Seeds:\n${seedPlan.english_seeds.map((seed) => `- ${seed}`).join('\n')}`);
  parts.push(`Keyword Map Summary:\n${buildKeywordMapReference(keywordMap)}`);
  parts.push(
    `Collected SERP Entries (${collectedEntries.length}):\n${collectedEntries
      .map((entry) => `- [${entry.source}] [${entry.seed_language}] [${entry.source_seed}] ${entry.query}`)
      .join('\n')}`
  );
  return parts.join('\n\n');
}

function parsePaaIdeaRows(raw: string): PaaIdeaRow[] {
  const parsed = JSON.parse(extractJsonObject(raw));
  const ideas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];

  return ideas
    .map((idea: any) => ({
      blog_title: normalizePaaText(String(idea?.blog_title || '')),
      source: idea?.source === 'PAA' ? 'PAA' : 'Related Search',
      source_seed: normalizePaaText(String(idea?.source_seed || '')),
      programmatic_variables: normalizePaaText(String(idea?.programmatic_variables || '')),
    }))
    .filter((idea: PaaIdeaRow) => idea.blog_title && idea.source_seed);
}

function errorPayload(err: unknown) {
  if (err instanceof AgentError) {
    return { error: err.userMessage, code: err.code, retryable: err.retryable };
  }
  return {
    error: err instanceof Error ? err.message : 'Unknown error',
    code: 'unknown',
    retryable: false,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const createdAt = nowIso();
  const jobId = randomJobId();

  try {
    const { formData, keywordMap } = req.body;
    if (!formData?.businessName?.trim()) return res.status(400).json({ error: 'Business name is required', code: 'validation' });
    if (!formData?.businessDescription?.trim()) return res.status(400).json({ error: 'Business description is required', code: 'validation' });
    if (!formData?.seoGoals?.trim()) return res.status(400).json({ error: 'SEO goals are required', code: 'validation' });
    if (!keywordMap?.groups?.length) return res.status(400).json({ error: 'keywordMap is required', code: 'validation' });

    const seedResponse = await generateOnly(
      getPaaBlogSeedSelectionPrompt(),
      buildPaaSeedSelectionUserMessage(formData, keywordMap),
      { jsonSchema: getPaaSeedSelectionJsonSchema() }
    );
    const seedPlan = parsePaaSeedPlan(seedResponse.result);
    const rawParts = [`Seed Plan\n${seedResponse.result}`];
    const collectedEntries: PaaCollectedEntry[] = [];
    const allSeeds = [
      ...seedPlan.thai_seeds.map((seed) => ({ keyword: seed, language: 'th' as const })),
      ...seedPlan.english_seeds.map((seed) => ({ keyword: seed, language: 'en' as const })),
    ];

    for (let index = 0; index < allSeeds.length; index += 1) {
      const seed = allSeeds[index];
      const features = await fetchGoogleOrganicSerpFeatures(seed.keyword, seed.language);
      rawParts.push(
        `Seed ${index + 1}/${allSeeds.length}: ${seed.keyword}\nPAA: ${features.paaTitles.join(' | ')}\nRelated: ${features.relatedSearches.join(' | ')}`
      );

      for (const title of features.paaTitles) {
        collectedEntries.push({
          query: title,
          source: 'PAA',
          source_seed: seed.keyword,
          seed_language: seed.language,
        });
      }

      for (const query of features.relatedSearches) {
        collectedEntries.push({
          query,
          source: 'Related Search',
          source_seed: seed.keyword,
          seed_language: seed.language,
        });
      }
    }

    const normalizedEntries = dedupeCollectedEntries(collectedEntries);
    const ideasResponse = await generateOnly(
      getPaaBlogIdeasPrompt(),
      buildPaaIdeasUserMessage(formData, keywordMap, seedPlan, normalizedEntries),
      { jsonSchema: getPaaBlogIdeasJsonSchema() }
    );
    rawParts.push(`Final Ideas\n${ideasResponse.result}`);

    const rawIdeas = parsePaaIdeaRows(ideasResponse.result);
    const filteredIdeas = filterCannibalizingIdeas(rawIdeas, keywordMap);

    const completedAt = nowIso();
    res.json({
      job_id: jobId,
      status: 'completed',
      created_at: createdAt,
      started_at: createdAt,
      completed_at: completedAt,
      progress: {
        phase: 'completed',
        total_serp_calls: allSeeds.length,
        completed_serp_calls: allSeeds.length,
        current_seed: null,
        message: 'PAA Blog ideation complete',
      },
      error: null,
      result: {
        seed_plan: seedPlan,
        collected_entries: normalizedEntries,
        ideas: filteredIdeas,
        collected_entry_count: normalizedEntries.length,
        idea_count: filteredIdeas.length,
        keyword_map_group_count: keywordMap.groups.length,
      },
      raw: rawParts.join('\n\n'),
    });
  } catch (err) {
    console.error('PAA Blog error:', err);
    const status = (err as any).code === 'auth_error' ? 401 : (err as any).code === 'rate_limit' ? 429 : 500;
    res.status(status).json(errorPayload(err));
  }
}
