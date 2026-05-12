import { Router, type Request, type Response } from 'express';

const DEFAULT_STEP2_ORIGIN = 'http://srv934175.hstgr.cloud:8010';

function getStep2Origin(): string {
  return (process.env.STEP2_API_ORIGIN || DEFAULT_STEP2_ORIGIN).replace(/\/$/, '');
}

export const step2ProxyRouter = Router();

step2ProxyRouter.all('/*', async (req: Request, res: Response) => {
  const proxyPath = req.params[0] || '';
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const targetUrl = `${getStep2Origin()}/${proxyPath}${query}`;

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(req.body ?? {}),
    });

    const contentType = upstream.headers.get('content-type') || 'application/json';
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    const payload = Buffer.from(await upstream.arrayBuffer());
    res.send(payload);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to proxy Step 2 request',
      code: 'step2_proxy_error',
    });
  }
});
