const GEMINI_EMBEDDING_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents';
const GEMINI_EMBED_BATCH_SIZE = 100;

type GeminiEmbeddingResponse = {
  embeddings?: Array<{
    values?: number[];
  }>;
};

function getGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY?.trim() || '';
}

export function isGeminiEmbeddingsEnabled(): boolean {
  return Boolean(getGeminiApiKey());
}

export async function embedTextsWithGemini(texts: string[]): Promise<number[][]> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const allEmbeddings: number[][] = [];

  for (let index = 0; index < texts.length; index += GEMINI_EMBED_BATCH_SIZE) {
    const batch = texts.slice(index, index + GEMINI_EMBED_BATCH_SIZE);
    const response = await fetch(GEMINI_EMBEDDING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        requests: batch.map((text) => ({
          model: 'models/gemini-embedding-001',
          taskType: 'SEMANTIC_SIMILARITY',
          content: {
            parts: [{ text }],
          },
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini embeddings request failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as GeminiEmbeddingResponse;
    const embeddings = Array.isArray(payload.embeddings) ? payload.embeddings : [];
    if (embeddings.length !== batch.length) {
      throw new Error('Gemini embeddings response length mismatch.');
    }

    for (const item of embeddings) {
      const values = Array.isArray(item?.values) ? item.values : [];
      if (!values.length) {
        throw new Error('Gemini embeddings response contained an empty vector.');
      }
      allEmbeddings.push(values);
    }
  }

  return allEmbeddings;
}
