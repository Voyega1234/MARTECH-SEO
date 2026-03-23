// Post-generation volume verification:
// Resolves EVERY keyword volume from DFS after the agent returns its JSON.
// This prevents LLM-authored numbers from reaching the UI.

const DFS_API_URL = 'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live';
const MAX_KEYWORDS_PER_CALL = 1000; // DFS limit
const DFS_LOCATION_CODE_THAILAND = 2764;
const DFS_LANGUAGE_CODE_THAI = 'th';

interface KeywordEntry {
  keyword: string;
  volume: number | string;
}

interface KeywordGroup {
  keyword_group: string;
  url_slug: string;
  keywords: KeywordEntry[];
}

interface TopicPillar {
  topic_pillar: string;
  pillar_intent: string;
  keyword_groups: KeywordGroup[];
}

interface ProductLine {
  product_line: string;
  topic_pillars: TopicPillar[];
}

interface KeywordData {
  location: string;
  product_lines: ProductLine[];
}

interface LookupVolumesResult {
  volumeMap: Map<string, number>;
  hadSuccessfulLookup: boolean;
}

function extractKeywordJson(text: string): KeywordData | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed?.product_lines && Array.isArray(parsed.product_lines)) {
      return parsed;
    }
  } catch {
    // Fall through to tolerant extraction
  }

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '```json' || trimmed === '```') continue;
    if (!trimmed.startsWith('{')) continue;

    const candidate = lines.slice(i).join('\n');
    let depth = 0;
    let end = -1;

    for (let j = 0; j < candidate.length; j++) {
      if (candidate[j] === '{') depth++;
      else if (candidate[j] === '}') {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }

    if (end < 0) continue;

    try {
      const parsed = JSON.parse(candidate.slice(0, end + 1));
      if (parsed?.product_lines && Array.isArray(parsed.product_lines)) {
        return parsed;
      }
    } catch {
      // Try next candidate
    }
  }

  return null;
}

function getDfsAuth(): string | null {
  const login = process.env.DFS_API_LOGIN;
  const password = process.env.DFS_API_PASSWORD;
  if (!login || !password) return null;
  return Buffer.from(`${login}:${password}`).toString('base64');
}

function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, ' ').toLowerCase();
}

async function lookupVolumes(keywords: string[]): Promise<LookupVolumesResult> {
  const auth = getDfsAuth();
  if (!auth) {
    console.warn('[VolumeVerifier] DFS credentials not set, skipping verification');
    return { volumeMap: new Map<string, number>(), hadSuccessfulLookup: false };
  }

  const volumeMap = new Map<string, number>();
  let hadSuccessfulLookup = false;

  // Batch if needed (DFS allows up to 1000 keywords per call)
  const batches: string[][] = [];
  for (let i = 0; i < keywords.length; i += MAX_KEYWORDS_PER_CALL) {
    batches.push(keywords.slice(i, i + MAX_KEYWORDS_PER_CALL));
  }

  for (const batch of batches) {
    try {
      const response = await fetch(DFS_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{
          keywords: batch,
          location_code: DFS_LOCATION_CODE_THAILAND,
          language_code: DFS_LANGUAGE_CODE_THAI,
          sort_by: 'relevance',
        }]),
      });

      if (!response.ok) {
        console.error(`[VolumeVerifier] DFS API error: ${response.status}`);
        continue;
      }

      const data = await response.json();

      if (data.tasks_error > 0) {
        console.error('[VolumeVerifier] DFS task error:', JSON.stringify(data.tasks?.[0] ?? data));
        continue;
      }

      hadSuccessfulLookup = true;

      const items: any[] = [];

      if (Array.isArray(data.items)) {
        items.push(...data.items);
      }

      if (Array.isArray(data.result)) {
        for (const result of data.result) {
          if (Array.isArray(result?.items)) items.push(...result.items);
          else if (result?.keyword) items.push(result);
        }
      }

      if (Array.isArray(data.tasks)) {
        for (const task of data.tasks) {
          if (!Array.isArray(task?.result)) continue;
          for (const result of task.result) {
            if (Array.isArray(result?.items)) items.push(...result.items);
            else if (result?.keyword) items.push(result);
          }
        }
      }

      for (const item of items) {
        const keyword = typeof item?.keyword === 'string' ? item.keyword : null;
        const vol = item?.keyword_info?.search_volume ?? item?.search_volume;
        if (keyword && typeof vol === 'number' && vol > 0) {
          volumeMap.set(normalizeKeyword(keyword), vol);
        }
      }
    } catch (err) {
      console.error(`[VolumeVerifier] DFS call failed:`, (err as Error).message);
    }
  }

  return { volumeMap, hadSuccessfulLookup };
}

export async function verifyDashVolumes(jsonStr: string): Promise<string> {
  const data = extractKeywordJson(jsonStr);
  if (!data) {
    console.warn('[VolumeVerifier] Could not parse keyword JSON, skipping verification');
    return jsonStr;
  }

  if (!data.product_lines || !Array.isArray(data.product_lines)) {
    return jsonStr;
  }

  // Step 1: Collect all keywords so DFS becomes the source of truth for every volume.
  const allKeywords: string[] = [];
  for (const pl of data.product_lines) {
    for (const tp of pl.topic_pillars || []) {
      for (const kg of tp.keyword_groups || []) {
        for (const kw of kg.keywords || []) {
          if (typeof kw.keyword === 'string' && kw.keyword.trim()) allKeywords.push(kw.keyword);
        }
      }
    }
  }

  if (allKeywords.length === 0) {
    console.log('[VolumeVerifier] No keywords found, skipping verification');
    return jsonStr;
  }

  const uniqueKeywords = [...new Set(allKeywords.map((kw) => kw.trim()).filter(Boolean))];

  console.log(`[VolumeVerifier] Resolving ${uniqueKeywords.length} unique keyword volumes from DFS...`);

  // Step 2: Call DFS API
  const { volumeMap, hadSuccessfulLookup } = await lookupVolumes(uniqueKeywords);
  if (!hadSuccessfulLookup) {
    console.warn('[VolumeVerifier] DFS lookup did not complete successfully, keeping original volumes');
    return jsonStr;
  }
  console.log(`[VolumeVerifier] DFS returned ${volumeMap.size} keywords with search volume data`);

  // Step 3: Overwrite all volumes using DFS data only.
  let updated = 0;
  let missing = 0;
  for (const pl of data.product_lines) {
    for (const tp of pl.topic_pillars || []) {
      for (const kg of tp.keyword_groups || []) {
        for (const kw of kg.keywords || []) {
          const realVolume = volumeMap.get(normalizeKeyword(kw.keyword));
          const nextVolume: number | string =
            typeof realVolume === 'number' && realVolume > 0 ? realVolume : '-';

          if (String(kw.volume) !== String(nextVolume)) updated++;
          if (nextVolume === '-') missing++;
          kw.volume = nextVolume;
        }
      }
    }
  }

  console.log(`[VolumeVerifier] Updated ${updated} keyword volumes; ${missing} keywords remain "-"`);

  return JSON.stringify(data);
}
