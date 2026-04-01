import type { KeywordGroupingPlan } from './keywordGroupingPlan.ts';

export type GroupingKeywordInput = {
  keyword: string;
  search_volume: number | '-' | null | undefined;
};

export type PillarDescriptor = {
  productLineIndex: number;
  pillarIndex: number;
  productLineName: string;
  pillarName: string;
  intent: string;
  text: string;
};

export type AssignedGroupingBatch = {
  productLineIndex: number;
  pillarIndex: number;
  keywords: GroupingKeywordInput[];
};

export function buildPillarDescriptors(plan: KeywordGroupingPlan): PillarDescriptor[] {
  return plan.product_lines.flatMap((productLine, productLineIndex) =>
    productLine.pillars.map((pillar, pillarIndex) => ({
      productLineIndex,
      pillarIndex,
      productLineName: productLine.name,
      pillarName: pillar.name,
      intent: pillar.intent,
      text: `product line: ${productLine.name} | pillar: ${pillar.name} | intent: ${pillar.intent}`,
    }))
  );
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const aValue = a[index] || 0;
    const bValue = b[index] || 0;
    dot += aValue * bValue;
    normA += aValue * aValue;
    normB += bValue * bValue;
  }

  if (!normA || !normB) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function buildAssignedGroupingBatches(
  plan: KeywordGroupingPlan,
  keywords: GroupingKeywordInput[],
  keywordEmbeddings: number[][],
  pillarEmbeddings: number[][],
  chunkSize: number
): AssignedGroupingBatch[] {
  const pillars = buildPillarDescriptors(plan);
  if (!pillars.length) {
    throw new Error('No pillars available for embedding assignment.');
  }
  if (keywords.length !== keywordEmbeddings.length) {
    throw new Error('Keyword embeddings length mismatch.');
  }
  if (pillars.length !== pillarEmbeddings.length) {
    throw new Error('Pillar embeddings length mismatch.');
  }

  const buckets = new Map<string, AssignedGroupingBatch>();

  for (let keywordIndex = 0; keywordIndex < keywords.length; keywordIndex += 1) {
    const keyword = keywords[keywordIndex];
    const keywordVector = keywordEmbeddings[keywordIndex];
    let bestPillarIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let pillarIndex = 0; pillarIndex < pillarEmbeddings.length; pillarIndex += 1) {
      const score = cosineSimilarity(keywordVector, pillarEmbeddings[pillarIndex]);
      if (score > bestScore) {
        bestScore = score;
        bestPillarIndex = pillarIndex;
      }
    }

    const pillar = pillars[bestPillarIndex];
    const bucketKey = `${pillar.productLineIndex}:${pillar.pillarIndex}`;
    const existing =
      buckets.get(bucketKey) ||
      {
        productLineIndex: pillar.productLineIndex,
        pillarIndex: pillar.pillarIndex,
        keywords: [],
      };
    existing.keywords.push(keyword);
    buckets.set(bucketKey, existing);
  }

  const batches: AssignedGroupingBatch[] = [];
  for (const bucket of buckets.values()) {
    const sortedKeywords = [...bucket.keywords].sort((a, b) => {
      const aVolume = typeof a.search_volume === 'number' ? a.search_volume : -1;
      const bVolume = typeof b.search_volume === 'number' ? b.search_volume : -1;
      if (bVolume !== aVolume) return bVolume - aVolume;
      return a.keyword.localeCompare(b.keyword);
    });

    for (let index = 0; index < sortedKeywords.length; index += chunkSize) {
      batches.push({
        productLineIndex: bucket.productLineIndex,
        pillarIndex: bucket.pillarIndex,
        keywords: sortedKeywords.slice(index, index + chunkSize),
      });
    }
  }

  return batches.sort((a, b) => {
    if (a.productLineIndex !== b.productLineIndex) return a.productLineIndex - b.productLineIndex;
    if (a.pillarIndex !== b.pillarIndex) return a.pillarIndex - b.pillarIndex;
    const aMaxVolume = typeof a.keywords[0]?.search_volume === 'number' ? a.keywords[0].search_volume : -1;
    const bMaxVolume = typeof b.keywords[0]?.search_volume === 'number' ? b.keywords[0].search_volume : -1;
    return bMaxVolume - aMaxVolume;
  });
}
