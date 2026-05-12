import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEFAULT_STEP2_ORIGIN = 'http://srv934175.hstgr.cloud:8010';

function getStep2Origin(): string {
  return (process.env.STEP2_API_ORIGIN || DEFAULT_STEP2_ORIGIN).replace(/\/$/, '');
}

function getProxyPath(req: VercelRequest): string {
  const value = req.query.path;
  const path = Array.isArray(value) ? value[0] : value;
  if (!path || !path.startsWith('/')) {
    throw new Error('Missing required query param: path');
  }
  return path;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const proxyPath = getProxyPath(req);
    const targetUrl = `${getStep2Origin()}${proxyPath}`;
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(req.body ?? {}),
    });

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    return res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to proxy Step 2 request',
      code: 'step2_proxy_error',
    });
  }
}
