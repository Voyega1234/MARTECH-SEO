import type {
  KeywordExpansionJobCreated,
  KeywordExpansionJob,
  KeywordExpansionJobRequest,
  SeedKeywordResponse,
} from './types';

const STEP2_API_BASE = (
  import.meta.env.VITE_STEP2_API_BASE_URL || 'http://127.0.0.1:8010'
).replace(/\/$/, '');

function buildRequestBody(input: KeywordExpansionJobRequest) {
  return {
    project_id: input.projectId,
    seed_keywords: input.seedKeywords,
    competitor_domains: input.competitorDomains,
    client_websites: input.clientWebsites,
    location_name: input.locationName,
    seed_limit_per_page: input.seedLimitPerPage,
    competitor_limit_per_page: input.competitorLimitPerPage,
    competitor_top_rank: input.competitorTopRank,
  };
}

export async function createKeywordExpansionJob(
  input: KeywordExpansionJobRequest
): Promise<KeywordExpansionJobCreated> {
  const res = await fetch(`${STEP2_API_BASE}/jobs/expand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildRequestBody(input)),
  });

  if (!res.ok) {
    throw new Error(`Step 2 API error: ${res.status}`);
  }

  return res.json();
}

export async function generateSeedKeywords(formData: Record<string, any>): Promise<SeedKeywordResponse> {
  const res = await fetch('/api/keywords/seeds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formData }),
  });

  if (!res.ok) {
    throw new Error(`Seed generation error: ${res.status}`);
  }

  return res.json();
}

export async function getKeywordExpansionJob(jobId: string): Promise<KeywordExpansionJob> {
  const res = await fetch(`${STEP2_API_BASE}/jobs/${jobId}`);
  if (!res.ok) {
    throw new Error(`Step 2 API error: ${res.status}`);
  }
  return res.json();
}

export async function getKeywordExpansionResult(jobId: string): Promise<KeywordExpansionJob> {
  const res = await fetch(`${STEP2_API_BASE}/jobs/${jobId}/result`);
  if (!res.ok) {
    throw new Error(`Step 2 API error: ${res.status}`);
  }
  return res.json();
}

export function getKeywordExpansionCsvUrl(jobId: string): string {
  return `${STEP2_API_BASE}/jobs/${jobId}/csv`;
}
