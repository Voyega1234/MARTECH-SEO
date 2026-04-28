export type TopicUniverseIntent = 'T' | 'C' | 'I' | 'N';

export interface TopicUniverseRow {
  index: number;
  dimension_name: string;
  what_it_covers: string;
  example_search_queries: string[];
  primary_intent: TopicUniverseIntent;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const start = trimmed.indexOf('{');
  if (start < 0) {
    throw new Error('Could not find a valid JSON object in Topic Universe output.');
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

  throw new Error('Could not find a complete JSON object in Topic Universe output.');
}

export function parseTopicUniverseOutput(raw: string): TopicUniverseRow[] {
  const parsed = JSON.parse(extractJsonObject(raw));
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];

  return rows
    .map((row: any, index: number) => {
      const exampleQueries = Array.isArray(row?.example_search_queries)
        ? row.example_search_queries.map((value: unknown) => cleanText(value)).filter(Boolean)
        : [];
      const intent = cleanText(row?.primary_intent).toUpperCase() as TopicUniverseIntent;
      if (!['T', 'C', 'I', 'N'].includes(intent)) return null;

      const dimensionName = cleanText(row?.dimension_name);
      const whatItCovers = cleanText(row?.what_it_covers);
      if (!dimensionName || !whatItCovers || !exampleQueries.length) return null;

      return {
        index: index + 1,
        dimension_name: dimensionName,
        what_it_covers: whatItCovers,
        example_search_queries: exampleQueries.slice(0, 5),
        primary_intent: intent,
      } satisfies TopicUniverseRow;
    })
    .filter((row): row is TopicUniverseRow => row !== null);
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function renderTopicUniverseCsv(rows: TopicUniverseRow[]): string {
  const lines = ['#,Dimension Name,What It Covers,Example Search Queries,Primary Intent'];

  for (const row of rows) {
    lines.push(
      [
        String(row.index),
        row.dimension_name,
        row.what_it_covers,
        row.example_search_queries.join(' | '),
        row.primary_intent,
      ].map(csvEscape).join(',')
    );
  }

  return lines.join('\n');
}
