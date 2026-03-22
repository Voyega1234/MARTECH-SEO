import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runAgent, AgentError } from '../_lib/agent';
import { getSitemapPrompt } from '../_lib/prompts';

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
      `\nKeyword Map Data:\n${typeof keywordData === 'string' ? keywordData : JSON.stringify(keywordData, null, 2)}`,
    ].join('\n');

    const result = await runAgent(systemPrompt, userMessage);
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
