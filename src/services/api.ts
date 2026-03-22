const API_BASE = '/api';

export interface AgentResult {
  success: boolean;
  result: string;
  toolsUsed: string[];
}

export interface StreamEvent {
  type: 'text' | 'tool' | 'done' | 'error';
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
  const res = await fetch(`${API_BASE}/keywords/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formData }),
  });

  if (!res.ok) throw new Error(`Server error: ${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event: StreamEvent = JSON.parse(line.slice(6));
        switch (event.type) {
          case 'text':
            callbacks.onText(event.content || '');
            break;
          case 'tool':
            callbacks.onTool(event.name || '');
            break;
          case 'done':
            callbacks.onDone(event.result || '');
            break;
          case 'error':
            callbacks.onError(event.message || 'Unknown error');
            break;
        }
      } catch {
        // skip parse errors
      }
    }
  }
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
  const res = await fetch(`${API_BASE}/sitemap/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywordData, businessContext }),
  });

  if (!res.ok) throw new Error(`Server error: ${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event: StreamEvent = JSON.parse(line.slice(6));
        switch (event.type) {
          case 'text':
            callbacks.onText(event.content || '');
            break;
          case 'tool':
            callbacks.onTool(event.name || '');
            break;
          case 'done':
            callbacks.onDone(event.result || '');
            break;
          case 'error':
            callbacks.onError(event.message || 'Unknown error');
            break;
        }
      } catch {
        // skip parse errors
      }
    }
  }
}
