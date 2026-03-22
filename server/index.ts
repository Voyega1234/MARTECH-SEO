import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { keywordRouter } from './routes/keywords.ts';
import { sitemapRouter } from './routes/sitemap.ts';

dotenv.config();

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/keywords', keywordRouter);
app.use('/api/sitemap', sitemapRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Quick test: Claude API + MCP connection
app.get('/api/test', async (_req, res) => {
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic();
    const { getMcpClient } = await import('./config/mcp.ts');

    const mcpClient = await getMcpClient();
    const { tools } = await mcpClient.listTools();

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
      mcpTools: tools.map((t: any) => t.name),
      model: process.env.CLAUDE_MODEL,
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
