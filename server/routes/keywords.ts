import { Router, Request, Response } from 'express';
import { runAgent, streamAgent, AgentError } from '../services/agent.ts';
import { getKeywordGeneratorPrompt } from '../config/prompts.ts';

export const keywordRouter = Router();

// Build user message from form data
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

// Validate form data
function validateFormData(formData: any): string | null {
  if (!formData) return 'formData is required';
  if (!formData.businessName?.trim()) return 'Business name is required';
  if (!formData.businessDescription?.trim()) return 'Business description is required';
  if (!formData.seoGoals?.trim()) return 'SEO goals are required';
  return null;
}

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

// POST /api/keywords/generate — Non-streaming
keywordRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    const { formData } = req.body;
    const validationError = validateFormData(formData);
    if (validationError) {
      res.status(400).json({ error: validationError, code: 'validation' });
      return;
    }

    const systemPrompt = getKeywordGeneratorPrompt();
    const userMessage = buildKeywordUserMessage(formData);

    const result = await runAgent(systemPrompt, userMessage);
    res.json(result);
  } catch (err) {
    console.error('Keyword generation error:', err);
    const status = (err as any).code === 'auth_error' ? 401
      : (err as any).code === 'rate_limit' ? 429
      : 500;
    res.status(status).json(errorResponse(err));
  }
});

// POST /api/keywords/stream — SSE streaming
keywordRouter.post('/stream', async (req: Request, res: Response) => {
  try {
    const { formData } = req.body;
    const validationError = validateFormData(formData);
    if (validationError) {
      res.status(400).json({ error: validationError, code: 'validation' });
      return;
    }

    const systemPrompt = getKeywordGeneratorPrompt();
    const userMessage = buildKeywordUserMessage(formData);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Handle client disconnect
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
    console.error('Keyword streaming error:', err);
    const errPayload = errorResponse(err);
    if (!res.headersSent) {
      res.status(500).json(errPayload);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: errPayload.error })}\n\n`);
      res.end();
    }
  }
});
