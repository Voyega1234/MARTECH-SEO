import type { VercelRequest, VercelResponse } from '@vercel/node';
import { streamAgent, AgentError } from '../_lib/agent.js';
import { getKeywordGeneratorPrompt } from '../_lib/prompts.js';

export const config = {
  supportsResponseStreaming: true,
};

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

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await streamAgent(systemPrompt, userMessage, {
      onText: (text) => {
        res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
      },
      onTool: (toolName) => {
        res.write(`data: ${JSON.stringify({ type: 'tool', name: toolName })}\n\n`);
      },
      onDone: (result) => {
        res.write(`data: ${JSON.stringify({ type: 'done', result })}\n\n`);
        res.end();
      },
      onError: (error) => {
        res.write(`data: ${JSON.stringify({ type: 'error', message: error })}\n\n`);
        res.end();
      },
    });
  } catch (err) {
    console.error('Keyword streaming error:', err);
    if (!res.headersSent) {
      const errMsg = err instanceof AgentError ? err.userMessage : (err as Error).message;
      res.status(500).json({ error: errMsg, code: 'unknown', retryable: false });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: (err as Error).message })}\n\n`);
      res.end();
    }
  }
}
