import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateOnly, AgentError } from '../_lib/agent.js';
import { getSitemapPrompt } from '../_lib/prompts.js';
import {
  applyRefinements,
  buildHybridSitemap,
  buildRefinementPrompt,
  buildRefinementUserMessage,
  parseRefinements,
} from '../../shared/sitemapGenerator.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { keywordData, businessContext } = req.body;
    if (!keywordData) {
      return res.status(400).json({ error: 'keywordData is required', code: 'validation' });
    }

    try {
      const { sections, aiCandidates } = buildHybridSitemap(keywordData, businessContext || '');
      let finalSections = sections;

      if (aiCandidates.length > 0) {
        try {
          const refineResult = await generateOnly(
            buildRefinementPrompt(),
            buildRefinementUserMessage(businessContext || '', aiCandidates),
          );
          finalSections = applyRefinements(finalSections, parseRefinements(refineResult.result));
        } catch (refineErr) {
          console.warn('[Sitemap] AI enrichment skipped, using heuristic sitemap:', refineErr);
        }
      }

      res.json({
        success: true,
        result: JSON.stringify({ sections: finalSections }),
        toolsUsed: aiCandidates.length > 0 ? ['sitemap-heuristic', 'sitemap-ai-enrich'] : ['sitemap-heuristic'],
      });
      return;
    } catch (hybridErr) {
      console.warn('[Sitemap] Hybrid generator failed, falling back to full AI:', hybridErr);
    }

    const systemPrompt = getSitemapPrompt();
    const userMessage = [
      `Business Context: ${businessContext || 'N/A'}`,
      `\nKeyword Map Data:\n${typeof keywordData === 'string' ? keywordData : JSON.stringify(keywordData)}`,
    ].join('\n');

    const fallbackResult = await generateOnly(systemPrompt, userMessage);
    res.json(fallbackResult);
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
