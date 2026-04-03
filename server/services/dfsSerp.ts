const DFS_BASE_URL = 'https://api.dataforseo.com/v3';

type DfsSerpFeatureResult = {
  paaTitles: string[];
  relatedSearches: string[];
};

function getAuthHeader(): string {
  const login = process.env.DFS_API_LOGIN;
  const password = process.env.DFS_API_PASSWORD;
  if (!login || !password) {
    throw new Error('DFS_API_LOGIN and DFS_API_PASSWORD must be set');
  }
  return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractStringList(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const values: string[] = [];

  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      values.push(item.trim());
      continue;
    }
    if (item && typeof item === 'object') {
      const title = cleanText((item as any).title);
      if (title) values.push(title);
      continue;
    }
  }

  return values;
}

export async function fetchGoogleOrganicSerpFeatures(
  keyword: string,
  languageCode: 'th' | 'en'
): Promise<DfsSerpFeatureResult> {
  const response = await fetch(`${DFS_BASE_URL}/serp/google/organic/live/advanced`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      {
        keyword,
        location_name: 'Thailand',
        language_code: languageCode,
        device: 'desktop',
        depth: 10,
        people_also_ask_click_depth: 4,
      },
    ]),
  });

  if (!response.ok) {
    throw new Error(`DataForSEO SERP error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const task = data?.tasks?.[0];
  const result = task?.result?.[0];
  const items = Array.isArray(result?.items) ? result.items : [];

  const paaTitles: string[] = [];
  const relatedSearches: string[] = [];

  for (const item of items) {
    const type = cleanText(item?.type);
    if (!type) continue;

    if (type === 'people_also_ask' || type === 'people_also_ask_element') {
      paaTitles.push(...extractStringList(item?.items));
      continue;
    }

    if (type === 'related_searches') {
      relatedSearches.push(...extractStringList(item?.items));
    }
  }

  return {
    paaTitles,
    relatedSearches,
  };
}
