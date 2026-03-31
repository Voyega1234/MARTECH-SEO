import { useEffect, useMemo, useState } from 'react';
import {
  createKeywordExpansionJob,
  getKeywordExpansionCsvUrl,
  getKeywordExpansionJob,
} from '../features/keyword-expansion/api';
import type { KeywordExpansionJob } from '../features/keyword-expansion/types';
import { listProjects, type SeoProject } from '../services/projects';

const initialSeeds = 'ฟิลเลอร์\nโบท็อกซ์\nhifu';
const initialCompetitors = 'theklinique.com\nromrawin.com';
const initialClientWebsites = 'aurabangkokclinic.com';

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function KeywordExpansionPage() {
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<SeoProject[]>([]);
  const [locationName, setLocationName] = useState('Thailand');
  const [seedKeywords, setSeedKeywords] = useState(initialSeeds);
  const [competitorDomains, setCompetitorDomains] = useState(initialCompetitors);
  const [clientWebsites, setClientWebsites] = useState(initialClientWebsites);
  const [job, setJob] = useState<KeywordExpansionJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const seedCount = useMemo(() => splitLines(seedKeywords).length, [seedKeywords]);
  const competitorCount = useMemo(() => splitLines(competitorDomains).length, [competitorDomains]);
  const clientWebsiteCount = useMemo(() => splitLines(clientWebsites).length, [clientWebsites]);
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) || null,
    [projectId, projects]
  );

  useEffect(() => {
    listProjects().then(setProjects).catch(() => undefined);
  }, []);

  const handleCreateJob = async () => {
    setLoading(true);
    setError('');

    try {
      const createdJob = await createKeywordExpansionJob({
        projectId: projectId.trim() || undefined,
        seedKeywords: splitLines(seedKeywords),
        competitorDomains: splitLines(competitorDomains),
        clientWebsites: splitLines(clientWebsites),
        locationName: locationName.trim() || 'Thailand',
      });
      const nextJob = await getKeywordExpansionJob(createdJob.job_id);
      setJob(nextJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!job) return;
    setLoading(true);
    setError('');

    try {
      const nextJob = await getKeywordExpansionJob(job.job_id);
      setJob(nextJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 8 }}>Keyword Expansion</h1>
      <p style={{ marginTop: 0, color: '#666' }}>
        Flow ใหม่นี้แยกจาก keyword generate เดิม และใช้ Step 2 API แยกสำหรับ expand keyword
        โดยไม่ทับ workflow ปัจจุบัน
      </p>

      <section style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        <label>
          <div>Project</div>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            style={{ width: '100%', padding: 10 }}
          >
            <option value="">No project selected</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.business_name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <div>Project ID (optional)</div>
          <input
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            style={{ width: '100%', padding: 10 }}
            placeholder="Supabase seo_projects.id"
          />
        </label>

        {selectedProject ? (
          <div style={{ padding: 12, background: '#f5f5f5', borderRadius: 10 }}>
            <strong>Business Context:</strong> {selectedProject.business_name}
            {selectedProject.website_url ? ` · ${selectedProject.website_url}` : ''}
          </div>
        ) : null}

        <label>
          <div>Location Name</div>
          <input
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            style={{ width: '100%', padding: 10 }}
          />
        </label>

        <label>
          <div>Seed Keywords ({seedCount})</div>
          <textarea
            value={seedKeywords}
            onChange={(e) => setSeedKeywords(e.target.value)}
            rows={8}
            style={{ width: '100%', padding: 10 }}
          />
        </label>

        <label>
          <div>Competitor Domains ({competitorCount})</div>
          <textarea
            value={competitorDomains}
            onChange={(e) => setCompetitorDomains(e.target.value)}
            rows={5}
            style={{ width: '100%', padding: 10 }}
          />
        </label>

        <label>
          <div>Client Websites ({clientWebsiteCount})</div>
          <textarea
            value={clientWebsites}
            onChange={(e) => setClientWebsites(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: 10 }}
          />
        </label>

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={handleCreateJob} disabled={loading}>
            Create Step 2 Job
          </button>
          <button onClick={handleRefresh} disabled={loading || !job}>
            Refresh Status
          </button>
          {job ? (
            <a href={getKeywordExpansionCsvUrl(job.job_id)} target="_blank" rel="noreferrer">
              Download CSV
            </a>
          ) : null}
        </div>
      </section>

      {error ? (
        <p style={{ color: '#b42318', marginTop: 16 }}>{error}</p>
      ) : null}

      {job ? (
        <section
          style={{
            marginTop: 24,
            padding: 16,
            border: '1px solid #ddd',
            borderRadius: 12,
            background: '#fafafa',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Job Status</h2>
          <p>
            <strong>Job ID:</strong> {job.job_id}
          </p>
          <p>
            <strong>Status:</strong> {job.status}
          </p>
          <p>
            <strong>Phase:</strong> {job.progress.phase}
          </p>
          <p>
            <strong>Message:</strong> {job.progress.message || '-'}
          </p>
          <p>
            <strong>API Calls:</strong> {job.progress.total_api_calls}
          </p>
        </section>
      ) : null}
    </main>
  );
}
