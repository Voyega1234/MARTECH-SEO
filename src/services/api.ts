const API_BASE = '/api';

// In dev, stream endpoints talk directly to Express (bypass Vite proxy which buffers SSE)
const STREAM_BASE = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api';

export interface AgentResult {
  success: boolean;
  result: string;
  toolsUsed: string[];
}

export interface StreamEvent {
  type: 'text' | 'tool' | 'done' | 'error' | 'status';
  content?: string;
  name?: string;
  result?: string;
  message?: string;
}

// Non-streaming keyword generation
export async function generateKeywords(formData: Record<string, any>): Promise<AgentResult> {
  const res = await fetch(`${API_BASE}/keywords/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formData }),
  });
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  return res.json();
}

function processSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: {
    onText: (text: string) => void;
    onTool: (toolName: string) => void;
    onDone: (result: string) => void;
    onError: (error: string) => void;
  }
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulatedText = '';
  let doneReceived = false;
  let eventCount = 0;

  console.log('[SSE] Stream started');

  return (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log(`[SSE] Stream ended. Events: ${eventCount}, AccumulatedText: ${accumulatedText.length} chars, DoneReceived: ${doneReceived}`);
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event: StreamEvent = JSON.parse(line.slice(6));
          eventCount++;
          switch (event.type) {
            case 'text':
              accumulatedText += event.content || '';
              callbacks.onText(event.content || '');
              break;
            case 'status':
              // Status messages are for UI display only — don't accumulate into result
              console.log('[SSE] Status:', (event.content || '').trim());
              callbacks.onText(event.content || '');
              break;
            case 'tool':
              console.log('[SSE] Tool:', event.name);
              callbacks.onTool(event.name || '');
              break;
            case 'done':
              doneReceived = true;
              console.log(`[SSE] Done received! result field: ${(event.result || '').length} chars, accumulatedText: ${accumulatedText.length} chars`);
              // accumulatedText contains only Phase 2 output (actual JSON)
              callbacks.onDone(event.result || accumulatedText);
              break;
            case 'error':
              doneReceived = true;
              console.error('[SSE] Error event:', event.message);
              callbacks.onError(event.message || 'Unknown error');
              break;
            default:
              console.warn('[SSE] Unknown event type:', event.type);
          }
        } catch (parseErr) {
          console.warn('[SSE] Failed to parse SSE line:', line.slice(0, 100), parseErr);
          // SSE line too large to parse — try to extract result from it
          const raw = line.slice(6);
          if (raw.includes('"type":"done"') || raw.includes('"type": "done"')) {
            const resultMatch = raw.match(/"result"\s*:\s*"([\s\S]*)"\s*\}$/);
            if (resultMatch) {
              try {
                const unescaped = JSON.parse(`"${resultMatch[1]}"`);
                doneReceived = true;
                console.log('[SSE] Extracted done from unparseable line');
                callbacks.onDone(unescaped);
              } catch {
                // Fall through to fallback
              }
            }
          }
        }
      }
    }

    // Fallback: if stream ended but we never got a done/error event,
    // use the accumulated text as the result
    if (!doneReceived && accumulatedText.length > 0) {
      console.warn(`[SSE] Stream ended without done event. Using accumulated text (${accumulatedText.length} chars) as result.`);
      callbacks.onDone(accumulatedText);
    } else if (!doneReceived) {
      console.error('[SSE] Stream ended with NO done event and NO accumulated text!');
    }
  })();
}

// Streaming keyword generation
export async function streamKeywords(
  formData: Record<string, any>,
  callbacks: {
    onText: (text: string) => void;
    onTool: (toolName: string) => void;
    onDone: (result: string) => void;
    onError: (error: string) => void;
  }
): Promise<void> {
  const url = `${STREAM_BASE}/keywords/stream`;
  console.log(`[streamKeywords] Fetching: ${url} (DEV=${import.meta.env.DEV})`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formData }),
  });

  console.log(`[streamKeywords] Response: ${res.status} ${res.statusText}`);
  if (!res.ok) throw new Error(`Server error: ${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  return processSSEStream(reader, callbacks);
}

// Non-streaming sitemap generation
export async function generateSitemap(
  keywordData: any,
  businessContext: string
): Promise<AgentResult> {
  const res = await fetch(`${API_BASE}/sitemap/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywordData, businessContext }),
  });
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  return res.json();
}

// Streaming sitemap generation
export async function streamSitemap(
  keywordData: any,
  businessContext: string,
  callbacks: {
    onText: (text: string) => void;
    onTool: (toolName: string) => void;
    onDone: (result: string) => void;
    onError: (error: string) => void;
  }
): Promise<void> {
  const res = await fetch(`${STREAM_BASE}/sitemap/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywordData, businessContext }),
  });

  if (!res.ok) throw new Error(`Server error: ${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  return processSSEStream(reader, callbacks);
}
