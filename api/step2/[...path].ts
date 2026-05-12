import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEFAULT_STEP2_ORIGIN = 'http://srv934175.hstgr.cloud:8010';

function getStep2Origin(): string {
  return (process.env.STEP2_API_ORIGIN || DEFAULT_STEP2_ORIGIN).replace(/\/$/, '');
}

function getProxyPath(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join('/');
  return value || '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const proxyPath = getProxyPath(req.query.path);
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue;
    if (Array.isArray(value)) {
      for (const item of value) searchParams.append(key, item);
    } else if (typeof value === 'string') {
      searchParams.append(key, value);
    }
  }

  const targetUrl = `${getStep2Origin()}/${proxyPath}${searchParams.size ? `?${searchParams.toString()}` : ''}`;
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
