import { Router, type Request, type Response } from 'express';

const DEFAULT_STEP2_ORIGIN = 'http://srv934175.hstgr.cloud:8010';

function getStep2Origin(): string {
  return (process.env.STEP2_API_ORIGIN || DEFAULT_STEP2_ORIGIN).replace(/\/$/, '');
}

export const step2ProxyQueryRouter = Router();

step2ProxyQueryRouter.all('/', async (req: Request, res: Response) => {
  const path = typeof req.query.path === 'string' ? req.query.path : '';
  if (!path.startsWith('/')) {
    return res.status(400).json({ error: 'Missing required query param: path', code: 'validation' });
  }

  try {
    const upstream = await fetch(`${getStep2Origin()}${path}`, {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(req.body ?? {}),
    });

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to proxy Step 2 request',
      code: 'step2_proxy_error',
    });
  }
});
