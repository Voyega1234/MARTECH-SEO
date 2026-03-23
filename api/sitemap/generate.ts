import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateOnly, AgentError } from '../_lib/agent.js';
import { getSitemapPrompt } from '../_lib/prompts.js';

// Trim keyword data for sitemap — keep structure + top 3 keywords per group
function trimKeywordDataForSitemap(data: any): any {
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!parsed?.product_lines) return parsed;

    return {
      location: parsed.location,
      product_lines: parsed.product_lines.map((pl: any) => ({
        product_line: pl.product_line,
        topic_pillars: pl.topic_pillars.map((tp: any) => ({
          topic_pillar: tp.topic_pillar,
          pillar_intent: tp.pillar_intent,
          keyword_groups: tp.keyword_groups.map((kg: any) => ({
            keyword_group: kg.keyword_group,
            url_slug: kg.url_slug,
            keywords: (kg.keywords || []).slice(0, 3),
          })),
        })),
      })),
    };
  } catch {
    return data;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { keywordData, businessContext } = req.body;
    if (!keywordData) {
      return res.status(400).json({ error: 'keywordData is required', code: 'validation' });
    }

    const systemPrompt = getSitemapPrompt();
    const userMessage = [
      `Business Context: ${businessContext || 'N/A'}`,
      `\nKeyword Map Data:\n${typeof keywordData === 'string' ? keywordData : JSON.stringify(keywordData)}`,
    ].join('\n');

    const result = await generateOnly(systemPrompt, userMessage);
    res.json(result);
  } catch (err) {
    console.error('Sitemap generation error:', err);
    const status = (err as any).code === 'auth_error' ? 401 : (err as any).code === 'rate_limit' ? 429 : 500;
    if (err instanceof AgentError) {
      res.status(status).json({ error: err.userMessage, code: err.code, retryable: err.retryable });
    } else {
      res.status(500).json({ error: (err as Error).message, code: 'unknown', retryable: false });
    }
  }
}
