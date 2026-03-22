import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runAgent, AgentError } from '../_lib/agent';
import { getKeywordGeneratorPrompt } from '../_lib/prompts';

function buildKeywordUserMessage(formData: Record<string, any>): string {
  const parts: string[] = [];
  parts.push(`Business Name: ${formData.businessName || 'N/A'}`);
  parts.push(`Website URL: ${formData.websiteUrl || 'N/A'}`);
  parts.push(`Business Description & Core Offerings: ${formData.businessDescription || 'N/A'}`);
  parts.push(`SEO Goals & Conversion Action: ${formData.seoGoals || 'N/A'}`);
  if (formData.mustRankKeywords?.length) {
    parts.push(`"Must-Rank" Keywords:\n${formData.mustRankKeywords.map((k: string) => `- ${k}`).join('\n')}`);
  }
  if (formData.focusProductLines?.length) {
    parts.push(`Focus Product Lines:\n${formData.focusProductLines.map((p: string) => `- ${p}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { formData } = req.body;
    if (!formData?.businessName?.trim()) return res.status(400).json({ error: 'Business name is required', code: 'validation' });
    if (!formData?.businessDescription?.trim()) return res.status(400).json({ error: 'Business description is required', code: 'validation' });
    if (!formData?.seoGoals?.trim()) return res.status(400).json({ error: 'SEO goals are required', code: 'validation' });

    const systemPrompt = getKeywordGeneratorPrompt();
    const userMessage = buildKeywordUserMessage(formData);
    const result = await runAgent(systemPrompt, userMessage);
    res.json(result);
  } catch (err) {
    console.error('Keyword generation error:', err);
    const status = (err as any).code === 'auth_error' ? 401 : (err as any).code === 'rate_limit' ? 429 : 500;
    if (err instanceof AgentError) {
      res.status(status).json({ error: err.userMessage, code: err.code, retryable: err.retryable });
    } else {
      res.status(500).json({ error: (err as Error).message, code: 'unknown', retryable: false });
    }
  }
}
