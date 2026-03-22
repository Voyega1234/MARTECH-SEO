import type { VercelRequest, VercelResponse } from '@vercel/node';
import { streamAgent, AgentError } from '../_lib/agent.js';
import { getSitemapPrompt } from '../_lib/prompts.js';

export const config = {
  supportsResponseStreaming: true,
};

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

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (data: string) => {
      res.write(data);
      if (typeof (res as any).flush === 'function') (res as any).flush();
    };

    await streamAgent(systemPrompt, userMessage, {
      onText: (text) => {
        send(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
      },
      onTool: (toolName) => {
        send(`data: ${JSON.stringify({ type: 'tool', name: toolName })}\n\n`);
      },
      onStatus: (status) => {
        send(`data: ${JSON.stringify({ type: 'status', content: status })}\n\n`);
      },
      onDone: () => {
        send(`data: ${JSON.stringify({ type: 'done', result: '' })}\n\n`);
        res.end();
      },
      onError: (error) => {
        send(`data: ${JSON.stringify({ type: 'error', message: error })}\n\n`);
        res.end();
      },
    });
  } catch (err) {
    console.error('Sitemap streaming error:', err);
    if (!res.headersSent) {
      const errMsg = err instanceof AgentError ? err.userMessage : (err as Error).message;
      res.status(500).json({ error: errMsg, code: 'unknown', retryable: false });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: (err as Error).message })}\n\n`);
      res.end();
    }
  }
}
