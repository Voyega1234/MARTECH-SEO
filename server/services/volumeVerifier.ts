// Post-generation volume verification:
// Collects all keywords with "-" volume, makes ONE DFS API call to check,
// patches back any real volumes found, keeps "-" for confirmed 0/null.

const DFS_API_URL = 'https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live';
const MAX_KEYWORDS_PER_CALL = 1000; // DFS limit

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

function getDfsAuth(): string | null {
  const login = process.env.DFS_API_LOGIN;
  const password = process.env.DFS_API_PASSWORD;
  if (!login || !password) return null;
  return Buffer.from(`${login}:${password}`).toString('base64');
}

async function lookupVolumes(keywords: string[]): Promise<Map<string, number>> {
  const auth = getDfsAuth();
  if (!auth) {
    console.warn('[VolumeVerifier] DFS credentials not set, skipping verification');
    return new Map();
  }

  const volumeMap = new Map<string, number>();

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
          location_name: 'Thailand',
          language_code: 'th',
          include_clickstream_data: false,
        }]),
      });

      if (!response.ok) {
        console.error(`[VolumeVerifier] DFS API error: ${response.status}`);
        continue;
      }

      const data = await response.json();

      // Extract volumes from DFS response
      if (data.tasks && Array.isArray(data.tasks)) {
        for (const task of data.tasks) {
          if (task.result && Array.isArray(task.result)) {
            for (const item of task.result) {
              // Handle both flat items and items with nested structure
              if (item.items && Array.isArray(item.items)) {
                for (const kw of item.items) {
                  const vol = kw.keyword_info?.search_volume ?? kw.search_volume;
                  if (vol && vol > 0) {
                    volumeMap.set(kw.keyword, vol);
                  }
                }
              } else if (item.keyword) {
                const vol = item.keyword_info?.search_volume ?? item.search_volume;
                if (vol && vol > 0) {
                  volumeMap.set(item.keyword, vol);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`[VolumeVerifier] DFS call failed:`, (err as Error).message);
    }
  }

  return volumeMap;
}

export async function verifyDashVolumes(jsonStr: string): Promise<string> {
  let data: KeywordData;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    console.warn('[VolumeVerifier] Could not parse keyword JSON, skipping verification');
    return jsonStr;
  }

  if (!data.product_lines || !Array.isArray(data.product_lines)) {
    return jsonStr;
  }

  // Step 1: Collect all keywords with "-" volume
  const dashKeywords: string[] = [];
  for (const pl of data.product_lines) {
    for (const tp of pl.topic_pillars || []) {
      for (const kg of tp.keyword_groups || []) {
        for (const kw of kg.keywords || []) {
          if (kw.volume === '-' || kw.volume === '–' || kw.volume === '—') {
            dashKeywords.push(kw.keyword);
          }
        }
      }
    }
  }

  if (dashKeywords.length === 0) {
    console.log('[VolumeVerifier] No "-" volumes found, skipping verification');
    return jsonStr;
  }

  console.log(`[VolumeVerifier] Found ${dashKeywords.length} keywords with "-" volume, verifying with DFS...`);

  // Step 2: Call DFS API
  const volumeMap = await lookupVolumes(dashKeywords);

  if (volumeMap.size === 0) {
    console.log('[VolumeVerifier] No real volumes found — all confirmed as "-"');
    return jsonStr;
  }

  console.log(`[VolumeVerifier] Found ${volumeMap.size} keywords with real volumes, patching...`);

  // Step 3: Patch back real volumes
  let patched = 0;
  for (const pl of data.product_lines) {
    for (const tp of pl.topic_pillars || []) {
      for (const kg of tp.keyword_groups || []) {
        for (const kw of kg.keywords || []) {
          if (kw.volume === '-' || kw.volume === '–' || kw.volume === '—') {
            const realVolume = volumeMap.get(kw.keyword);
            if (realVolume && realVolume > 0) {
              kw.volume = realVolume;
              patched++;
            }
          }
        }
      }
    }
  }

  console.log(`[VolumeVerifier] Patched ${patched} keyword volumes`);

  return JSON.stringify(data);
}
