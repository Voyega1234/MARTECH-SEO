import type {
  KeywordExpansionJobCreated,
  KeywordExpansionJob,
  KeywordExpansionJobRequest,
  KeywordGroupingJobCreated,
  KeywordGroupingJobDetail,
  KeywordGroupingFinalResponse,
  KeywordGroupingPlanResponse,
  KeywordExpansionKeywordRow,
  KeywordRelevanceFilterResponse,
  SeedKeywordResponse,
} from './types';

const STEP2_API_BASE = (
  import.meta.env.VITE_STEP2_API_BASE_URL || 'http://127.0.0.1:8010'
).replace(/\/$/, '');
const STEP3_API_BASE = (
  import.meta.env.VITE_STEP3_API_BASE_URL || '/api/keywords'
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
  const res = await fetch(`${STEP3_API_BASE}/seeds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formData }),
  });

  if (!res.ok) {
    throw new Error(`Seed generation error: ${res.status}`);
  }

  return res.json();
}

export async function filterRelevantKeywords(
  formData: Record<string, any>,
  keywords: KeywordExpansionKeywordRow[]
): Promise<KeywordRelevanceFilterResponse> {
  const res = await fetch(`${STEP3_API_BASE}/relevance-filter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formData, keywords }),
  });

  if (!res.ok) {
    let message = `Keyword relevance filter error: ${res.status}`;
    try {
      const errorPayload = await res.json();
      if (errorPayload?.error) {
        message = errorPayload.error;
      }
    } catch {
      // ignore parse failures and keep default message
    }
    throw new Error(message);
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

export async function generateKeywordGroupingPlan(
  formData: Record<string, any>,
  keywords: KeywordExpansionKeywordRow[]
): Promise<KeywordGroupingPlanResponse> {
  const res = await fetch(`${STEP3_API_BASE}/grouping-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formData, keywords }),
  });

  if (!res.ok) {
    let message = `Grouping plan error: ${res.status}`;
    try {
      const errorPayload = await res.json();
      if (errorPayload?.error) {
        message = errorPayload.error;
      }
    } catch {
      // ignore parse failures and keep default message
    }
    throw new Error(message);
  }

  return res.json();
}

export async function generateKeywordGroupingFinal(
  formData: Record<string, any>,
  plan: KeywordGroupingPlanResponse['plan'],
  keywords: KeywordExpansionKeywordRow[]
): Promise<KeywordGroupingFinalResponse> {
  const res = await fetch(`${STEP3_API_BASE}/grouping-final`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formData, plan, keywords }),
  });

  if (!res.ok) {
    let message = `Grouping final error: ${res.status}`;
    try {
      const errorPayload = await res.json();
      if (errorPayload?.error) {
        message = errorPayload.error;
      }
    } catch {
      // ignore parse failures and keep default message
    }
    throw new Error(message);
  }

  return res.json();
}

export async function createKeywordGroupingJob(
  formData: Record<string, any>,
  keywords: KeywordExpansionKeywordRow[]
): Promise<KeywordGroupingJobCreated> {
  const res = await fetch(`${STEP3_API_BASE}/grouping-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formData, keywords }),
  });

  if (!res.ok) {
    let message = `Grouping job error: ${res.status}`;
    try {
      const errorPayload = await res.json();
      if (errorPayload?.error) {
        message = errorPayload.error;
      }
    } catch {
      // ignore parse failures and keep default message
    }
    throw new Error(message);
  }

  return res.json();
}

export async function getKeywordGroupingJob(jobId: string): Promise<KeywordGroupingJobDetail> {
  const res = await fetch(`${STEP3_API_BASE}/grouping-jobs/${jobId}`);

  if (!res.ok) {
    let message = `Grouping job error: ${res.status}`;
    try {
      const errorPayload = await res.json();
      if (errorPayload?.error) {
        message = errorPayload.error;
      }
    } catch {
      // ignore parse failures and keep default message
    }
    throw new Error(message);
  }

  return res.json();
}
