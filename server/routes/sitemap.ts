import { Router, Request, Response } from 'express';
import { runAgent, streamAgent, AgentError } from '../services/agent.ts';
import { getSitemapPrompt } from '../config/prompts.ts';

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

    const systemPrompt = getSitemapPrompt();
    const userMessage = [
      `Business Context: ${businessContext || 'N/A'}`,
      `\nKeyword Map Data:\n${typeof keywordData === 'string' ? keywordData : JSON.stringify(keywordData, null, 2)}`,
    ].join('\n');

    const result = await runAgent(systemPrompt, userMessage);
    res.json(result);
  } catch (err) {
    console.error('Sitemap generation error:', err);
    const status = (err as any).code === 'auth_error' ? 401
      : (err as any).code === 'rate_limit' ? 429
      : 500;
    res.status(status).json(errorResponse(err));
  }
});

// POST /api/sitemap/stream — SSE streaming
sitemapRouter.post('/stream', async (req: Request, res: Response) => {
  try {
    const { keywordData, businessContext } = req.body;
    if (!keywordData) {
      res.status(400).json({ error: 'keywordData is required', code: 'validation' });
      return;
    }

    const systemPrompt = getSitemapPrompt();
    const userMessage = [
      `Business Context: ${businessContext || 'N/A'}`,
      `\nKeyword Map Data:\n${typeof keywordData === 'string' ? keywordData : JSON.stringify(keywordData, null, 2)}`,
    ].join('\n');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
      console.log('[Stream] Client disconnected');
    });

    await streamAgent(systemPrompt, userMessage, {
      onText: (text) => {
        if (clientDisconnected) return;
        res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
      },
      onTool: (toolName) => {
        if (clientDisconnected) return;
        res.write(`data: ${JSON.stringify({ type: 'tool', name: toolName })}\n\n`);
      },
      onDone: (result) => {
        if (clientDisconnected) return;
        res.write(`data: ${JSON.stringify({ type: 'done', result })}\n\n`);
        res.end();
      },
      onError: (error) => {
        if (clientDisconnected) return;
        res.write(`data: ${JSON.stringify({ type: 'error', message: error })}\n\n`);
        res.end();
      },
    });
  } catch (err) {
    console.error('Sitemap streaming error:', err);
    const errPayload = errorResponse(err);
    if (!res.headersSent) {
      res.status(500).json(errPayload);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: errPayload.error })}\n\n`);
      res.end();
    }
  }
});
