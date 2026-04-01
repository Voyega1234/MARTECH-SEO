import type { KeywordGroupingPlan } from './keywordGroupingPlan.ts';
import type { KeywordGroupingGroup, KeywordGroupingVariation } from './keywordGroupingOutput.ts';
import { buildPillarDescriptors } from './keywordGroupingEmbeddings.ts';

type GroupingKeywordInput = {
  keyword: string;
  search_volume: number | '-' | null | undefined;
};

type DraftCluster = {
  id: number;
  product_line: string;
  pillar: string;
  intent: KeywordGroupingGroup['intent'];
  keywords: KeywordGroupingVariation[];
  representative_keyword: string;
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const aValue = a[index] || 0;
    const bValue = b[index] || 0;
    dot += aValue * bValue;
    normA += aValue * aValue;
    normB += bValue * bValue;
  }

  if (!normA || !normB) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function detectModifierBucket(keyword: string): string {
  const normalized = normalizeKey(keyword);

  if (/(ราคา|price|cost|กี่บาท|เท่าไหร่)/i.test(normalized)) return 'price';
  if (/(review|รีวิว|ดีไหม|ที่ไหนดี|recommend|แนะนำ)/i.test(normalized)) return 'review';
  if (/(what is|คืออะไร|คือ|meaning)/i.test(normalized)) return 'what_is';
  if (/(how to|วิธี|ทำยังไง|แก้ยังไง|รักษา|แก้|ดูแล)/i.test(normalized)) return 'how_to';
  if (/(vs|compare|เปรียบเทียบ|ต่างกัน|ดีกว่า)/i.test(normalized)) return 'compare';
  if (/(ข้อเสีย|side effect|อันตราย|เจ็บไหม|พักฟื้น)/i.test(normalized)) return 'risk';
  if (/(near me|ใกล้ฉัน|ที่ไหน|คลินิก)/i.test(normalized)) return 'location';
  return 'core';
}

function averageEmbedding(vectors: number[][]): number[] {
  if (!vectors.length) return [];
  const length = Math.max(...vectors.map((vector) => vector.length));
  const output = new Array<number>(length).fill(0);

  for (const vector of vectors) {
    for (let index = 0; index < length; index += 1) {
      output[index] += vector[index] || 0;
    }
  }

  return output.map((value) => value / vectors.length);
}

export function buildEmbeddingFirstDraftGroups(
  plan: KeywordGroupingPlan,
  keywords: GroupingKeywordInput[],
  keywordEmbeddings: number[][],
  pillarEmbeddings: number[][]
): DraftCluster[] {
  const pillars = buildPillarDescriptors(plan);
  if (!pillars.length) {
    throw new Error('No pillars available for embedding-first grouping.');
  }

  const pillarBuckets = new Map<
    string,
    Array<{
      keyword: KeywordGroupingVariation;
      embedding: number[];
      modifier: string;
    }>
  >();

  keywords.forEach((keyword, index) => {
    const vector = keywordEmbeddings[index];
    let bestPillarIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    pillarEmbeddings.forEach((pillarVector, pillarIndex) => {
      const score = cosineSimilarity(vector, pillarVector);
      if (score > bestScore) {
        bestScore = score;
        bestPillarIndex = pillarIndex;
      }
    });

    const pillar = pillars[bestPillarIndex];
    const bucketKey = `${pillar.productLineIndex}:${pillar.pillarIndex}`;
    const current = pillarBuckets.get(bucketKey) || [];
    current.push({
      keyword: {
        keyword: keyword.keyword,
        search_volume: typeof keyword.search_volume === 'number' ? keyword.search_volume : '-',
      },
      embedding: vector,
      modifier: detectModifierBucket(keyword.keyword),
    });
    pillarBuckets.set(bucketKey, current);
  });

  const clusters: DraftCluster[] = [];
  let clusterId = 0;

  for (const [bucketKey, bucketItems] of pillarBuckets.entries()) {
    const [productLineIndex, pillarIndex] = bucketKey.split(':').map(Number);
    const productLine = plan.product_lines[productLineIndex];
    const pillar = productLine.pillars[pillarIndex];
    const clusterDrafts: Array<{
      modifier: string;
      keywords: KeywordGroupingVariation[];
      embeddings: number[][];
    }> = [];

    const sortedItems = [...bucketItems].sort((a, b) => {
      const aVolume = typeof a.keyword.search_volume === 'number' ? a.keyword.search_volume : -1;
      const bVolume = typeof b.keyword.search_volume === 'number' ? b.keyword.search_volume : -1;
      if (bVolume !== aVolume) return bVolume - aVolume;
      return a.keyword.keyword.localeCompare(b.keyword.keyword);
    });

    for (const item of sortedItems) {
      let matched = false;

      for (const cluster of clusterDrafts) {
        if (cluster.modifier !== item.modifier) continue;
        const similarity = cosineSimilarity(item.embedding, averageEmbedding(cluster.embeddings));
        if (similarity >= 0.84 || (cluster.keywords.length === 1 && similarity >= 0.8)) {
          cluster.keywords.push(item.keyword);
          cluster.embeddings.push(item.embedding);
          matched = true;
          break;
        }
      }

      if (!matched) {
        clusterDrafts.push({
          modifier: item.modifier,
          keywords: [item.keyword],
          embeddings: [item.embedding],
        });
      }
    }

    for (const cluster of clusterDrafts) {
      const sortedKeywords = [...cluster.keywords].sort((a, b) => {
        const aVolume = typeof a.search_volume === 'number' ? a.search_volume : -1;
        const bVolume = typeof b.search_volume === 'number' ? b.search_volume : -1;
        if (bVolume !== aVolume) return bVolume - aVolume;
        return a.keyword.localeCompare(b.keyword);
      });

      clusters.push({
        id: clusterId,
        product_line: productLine.name,
        pillar: pillar.name,
        intent: pillar.intent,
        keywords: sortedKeywords,
        representative_keyword: sortedKeywords[0]?.keyword || 'Ungrouped Keywords',
      });
      clusterId += 1;
    }
  }

  return clusters.sort((a, b) => {
    if (a.product_line !== b.product_line) return a.product_line.localeCompare(b.product_line);
    if (a.pillar !== b.pillar) return a.pillar.localeCompare(b.pillar);
    const aVolume = typeof a.keywords[0]?.search_volume === 'number' ? a.keywords[0].search_volume : -1;
    const bVolume = typeof b.keywords[0]?.search_volume === 'number' ? b.keywords[0].search_volume : -1;
    return bVolume - aVolume;
  });
}
