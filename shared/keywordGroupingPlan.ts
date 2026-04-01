export type PillarIntent = 'T' | 'C' | 'I' | 'N';

export interface KeywordGroupingPlanPillar {
  name: string;
  intent: PillarIntent;
}

export interface KeywordGroupingPlanProductLine {
  name: string;
  pillars: KeywordGroupingPlanPillar[];
}

export interface KeywordGroupingPlan {
  product_lines: KeywordGroupingPlanProductLine[];
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

const VALID_INTENTS = new Set<PillarIntent>(['T', 'C', 'I', 'N']);

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const start = trimmed.indexOf('{');
  if (start < 0) {
    throw new Error('Could not find a valid JSON object in grouping plan output.');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(start, index + 1);
      }
    }
  }

  throw new Error('Could not find a complete JSON object in grouping plan output.');
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseAndValidateKeywordGroupingPlanOutput(raw: string): KeywordGroupingPlan {
  const parsed = JSON.parse(extractJsonObject(raw));
  const productLines = Array.isArray(parsed?.product_lines) ? parsed.product_lines : [];

  if (!productLines.length) {
    throw new Error('Grouping plan must contain at least one product line.');
  }

  const normalizedProductLines: KeywordGroupingPlanProductLine[] = [];

  for (const productLine of productLines) {
    const productLineName = cleanText(productLine?.name);
    const pillars = Array.isArray(productLine?.pillars) ? productLine.pillars : [];

    if (!productLineName) continue;
    if (!pillars.length) continue;

    const normalizedPillars: KeywordGroupingPlanPillar[] = [];
    const seenPillars = new Set<string>();

    for (const pillar of pillars) {
      const pillarName = cleanText(pillar?.name);
      const intent = cleanText(pillar?.intent).toUpperCase() as PillarIntent;
      if (!pillarName || !VALID_INTENTS.has(intent)) continue;

      const pillarKey = pillarName.toLowerCase();
      if (seenPillars.has(pillarKey)) continue;
      seenPillars.add(pillarKey);

      normalizedPillars.push({
        name: pillarName,
        intent,
      });
    }

    if (!normalizedPillars.length) continue;

    normalizedProductLines.push({
      name: productLineName,
      pillars: normalizedPillars,
    });
  }

  if (!normalizedProductLines.length) {
    throw new Error('Grouping plan did not contain any valid product lines or pillars.');
  }

  return {
    product_lines: normalizedProductLines,
  };
}

export function mergeKeywordGroupingPlans(plans: KeywordGroupingPlan[]): KeywordGroupingPlan {
  const productLineMap = new Map<string, KeywordGroupingPlanProductLine>();

  for (const plan of plans) {
    for (const productLine of plan.product_lines) {
      const productLineKey = normalizeKey(productLine.name);
      const existingProductLine = productLineMap.get(productLineKey);

      if (!existingProductLine) {
        productLineMap.set(productLineKey, {
          name: productLine.name,
          pillars: [...productLine.pillars],
        });
        continue;
      }

      const seenPillars = new Set(existingProductLine.pillars.map((pillar) => normalizeKey(pillar.name)));
      for (const pillar of productLine.pillars) {
        const pillarKey = normalizeKey(pillar.name);
        if (seenPillars.has(pillarKey)) continue;
        seenPillars.add(pillarKey);
        existingProductLine.pillars.push(pillar);
      }
    }
  }

  const productLines = [...productLineMap.values()]
    .map((productLine) => ({
      ...productLine,
      pillars: productLine.pillars.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!productLines.length) {
    throw new Error('Grouping plan merge produced no valid product lines.');
  }

  return { product_lines: productLines };
}
