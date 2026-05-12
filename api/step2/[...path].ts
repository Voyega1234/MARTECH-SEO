import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEFAULT_STEP2_ORIGIN = 'http://srv934175.hstgr.cloud:8010';

function getStep2Origin(): string {
  return (process.env.STEP2_API_ORIGIN || DEFAULT_STEP2_ORIGIN).replace(/\/$/, '');
}

function buildTargetUrl(req: VercelRequest): string {
  const requestUrl = req.url || '';
  const [pathname, query = ''] = requestUrl.split('?');
  const proxyPath = pathname.replace(/^\/api\/step2\/?/, '');
  return `${getStep2Origin()}/${proxyPath}${query ? `?${query}` : ''}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const targetUrl = buildTargetUrl(req);
  const headers: HeadersInit = {
    'Content-Type': req.headers['content-type'] || 'application/json',
  };

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(req.body ?? {}),
    });

    const contentType = upstream.headers.get('content-type') || 'application/json';
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);

    const payload = await upstream.arrayBuffer();
    return res.send(Buffer.from(payload));
  } catch (err) {
    return res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to proxy Step 2 request',
      code: 'step2_proxy_error',
    });
  }
}
