import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { keywordRouter } from './routes/keywords.ts';
import { sitemapRouter } from './routes/sitemap.ts';

dotenv.config();

const app = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/keywords', keywordRouter);
app.use('/api/sitemap', sitemapRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SSE test endpoint (POST) — simulates the async callback pattern used by streamAgent
app.post('/api/sse-test', async (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.flushHeaders();
  res.socket?.setNoDelay(true);

  const send = (data: string) => {
    const ok = res.write(data);
    console.log(`[SSE-test-POST] write returned: ${ok}`);
  };

  // Simulate the exact pattern: async function with callbacks
  async function simulateAgent(onStatus: (s: string) => void, onText: (t: string) => void) {
    onStatus('[Connected...]\n');
    console.log('[SSE-test-POST] Sent connected');

    // Simulate Phase 1: long API call with heartbeat
    onStatus('[Research loop 1...]\n');
    console.log('[SSE-test-POST] Sent research 1');
    await new Promise(r => setTimeout(r, 3000)); // simulate 3s API call

    onStatus('[Research loop 2...]\n');
    console.log('[SSE-test-POST] Sent research 2');
    await new Promise(r => setTimeout(r, 3000));

    // Simulate Phase 2: streaming text
    onStatus('[Generating...]\n');
    for (let i = 0; i < 5; i++) {
      onText(`chunk_${i} `);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  await simulateAgent(
    (status) => send(`data: ${JSON.stringify({ type: 'status', content: status })}\n\n`),
    (text) => send(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`),
  );

  send(`data: ${JSON.stringify({ type: 'done', result: '' })}\n\n`);
  res.end();
  console.log('[SSE-test-POST] Done');
});

// SSE test endpoint (GET) — sends 5 events, 1 per second
app.get('/api/sse-test', (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.socket?.setNoDelay(true);

  let count = 0;
  const iv = setInterval(() => {
    count++;
    res.write(`data: {"type":"text","content":"Event ${count} at ${new Date().toISOString()}"}\n\n`);
    console.log(`[SSE-test] Sent event ${count}`);
    if (count >= 5) {
      res.write(`data: {"type":"done","result":"test complete"}\n\n`);
      res.end();
      clearInterval(iv);
    }
  }, 1000);

  _req.on('close', () => clearInterval(iv));
});

// Quick test: Claude API connection
app.get('/api/test', async (_req, res) => {
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic();

    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Say "hello" in one word' }],
    });

    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    res.json({
      claude: 'ok',
      response: text,
      model: process.env.CLAUDE_MODEL,
      mcp: 'client-side MCP (local)',
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🚀 SEO Agent server running on port ${PORT}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use. Run: kill $(lsof -ti:${PORT})`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});
