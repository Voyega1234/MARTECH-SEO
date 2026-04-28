import { dedupeAndValidateSeeds } from './seedKeywords.ts';

export type SitemapSeedCoverageStatus = 'seeded' | 'intentionally_unseeded';

export interface SitemapSeedCoverageRow {
  slug_and_path: string;
  dimension_name: string | null;
  coverage_status: SitemapSeedCoverageStatus;
  covering_seeds: string[];
  reason_if_unseeded: string | null;
}

export interface SitemapSeedPlan {
  seeds: string[];
  coverage: SitemapSeedCoverageRow[];
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
    throw new Error('Could not find a valid JSON object in seed plan output.');
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

  throw new Error('Could not find a complete JSON object in seed plan output.');
}

export function parseSitemapSeedPlanOutput(raw: string): SitemapSeedPlan {
  const parsed = JSON.parse(extractJsonObject(raw));
  const rawSeeds = Array.isArray(parsed?.seeds) ? parsed.seeds.map((value: unknown) => cleanText(value)).filter(Boolean) : [];
  const coverage = Array.isArray(parsed?.coverage)
    ? parsed.coverage
        .map((row: any) => {
          const status = row?.coverage_status === 'intentionally_unseeded' ? 'intentionally_unseeded' : 'seeded';
          const coveringSeeds = Array.isArray(row?.covering_seeds)
            ? row.covering_seeds.map((value: unknown) => cleanText(value)).filter(Boolean)
            : [];
          const slug = cleanText(row?.slug_and_path);
          if (!slug) return null;
          return {
            slug_and_path: slug,
            dimension_name: cleanText(row?.dimension_name) || null,
            coverage_status: status,
            covering_seeds: coveringSeeds,
            reason_if_unseeded: cleanText(row?.reason_if_unseeded) || null,
          } satisfies SitemapSeedCoverageRow;
        })
        .filter((row: SitemapSeedCoverageRow | null): row is SitemapSeedCoverageRow => row !== null)
    : [];

  const seeds = dedupeAndValidateSeeds(rawSeeds);
  const allowedSeedSet = new Set(seeds.map((seed) => seed.toLowerCase()));

  return {
    seeds,
    coverage: coverage.map((row) => ({
      ...row,
      covering_seeds: row.covering_seeds.filter((seed) => allowedSeedSet.has(seed.toLowerCase())),
    })),
  };
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function renderSitemapSeedCoverageCsv(plan: SitemapSeedPlan): string {
  const lines = ['Slug and Path,Dimension Name,Coverage Status,Covering Seeds,Reason If Unseeded'];

  for (const row of plan.coverage) {
    lines.push(
      [
        row.slug_and_path,
        row.dimension_name || '',
        row.coverage_status,
        row.covering_seeds.join(' | '),
        row.reason_if_unseeded || '',
      ].map(csvEscape).join(',')
    );
  }

  return lines.join('\n');
}
