import { Router, Request, Response } from 'express';
import { generateOnly, AgentError } from '../services/agent.ts';
import { getSitemapPrompt } from '../config/prompts.ts';
import {
  applyRefinements,
  buildHybridSitemap,
  buildRefinementPrompt,
  buildRefinementUserMessage,
  parseRefinements,
} from '../../shared/sitemapGenerator.ts';

export const sitemapRouter = Router();

function errorResponse(err: any) {
  if (err instanceof AgentError) {
    return {
      error: err.userMessage,
      code: err.code,
      retryable: err.retryable,
    };
  }
  return {
    error: (err as Error).message || 'Unknown error',
    code: 'unknown',
    retryable: false,
  };
}
// POST /api/sitemap/generate — Non-streaming
sitemapRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    const { keywordData, businessContext } = req.body;
    if (!keywordData) {
      res.status(400).json({ error: 'keywordData is required', code: 'validation' });
      return;
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
    const status = (err as any).code === 'auth_error' ? 401
      : (err as any).code === 'rate_limit' ? 429
      : 500;
    res.status(status).json(errorResponse(err));
  }
});
