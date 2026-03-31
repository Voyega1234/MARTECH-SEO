import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { DynamicList } from './components/DynamicList';
import { ExpandedKeywordTable } from './components/ExpandedKeywordTable';
import { Header } from './components/Header';
import { Input } from './components/Input';
import { Sidebar } from './components/Sidebar';
import { TextArea } from './components/TextArea';
import {
  createKeywordExpansionJob,
  generateSeedKeywords,
  getKeywordExpansionJob,
  getKeywordExpansionResult,
} from './features/keyword-expansion/api';
import type {
  KeywordExpansionJob,
  KeywordExpansionResult,
} from './features/keyword-expansion/types';
import {
  createProject,
  deleteProject,
  listProjects,
  loadProject,
  saveKeywordResult,
  type SeoProject,
} from './services/projects';
import {
  listKeywordSeedRuns,
  type KeywordSeedRunHistoryRow,
} from './features/keyword-expansion/supabase';

const initialFormData: Record<string, any> = {
  businessName: '',
  websiteUrl: '',
  businessDescription: '',
  seoGoals: '',
  mustRankKeywords: [],
  focusProductLines: [],
  competitorDomains: [],
  clientWebsites: [],
  locationName: 'Thailand',
};

const mockFormData: Record<string, any> = {
  businessName: 'Aura Bangkok Clinic',
  websiteUrl: 'https://aurabangkokclinic.com',
  businessDescription:
    'Aura Bangkok Clinic is a beauty clinic focused on fillers, botox, HIFU, skin boosters, and facial contouring for customers seeking anti-aging and skin improvement treatments.',
  seoGoals:
    'SEO Goal: capture high-intent traffic for aesthetic treatments and generate appointment or consultation leads. Conversion Action: book consultation or submit lead form.',
  mustRankKeywords: ['ฟิลเลอร์', 'โบท็อกซ์', 'hifu'],
  focusProductLines: ['Fillers', 'Botox'],
  competitorDomains: ['theklinique.com', 'romrawin.com'],
  clientWebsites: ['aurabangkokclinic.com'],
  locationName: 'Thailand',
};

type ActivePanel = 'business' | 'seeds' | 'keywords';
type GeneratingState = null | 'seeds' | 'keywords';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleDateString();
}

export default function NewApp() {
  const [formData, setFormData] = useState<Record<string, any>>({ ...initialFormData });
  const [activePanel, setActivePanel] = useState<ActivePanel>('business');
  const [generating, setGenerating] = useState<GeneratingState>(null);
  const [seedKeywordsText, setSeedKeywordsText] = useState('');
  const [draftSeedKeywordsText, setDraftSeedKeywordsText] = useState('');
  const [isEditingSeeds, setIsEditingSeeds] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState<KeywordExpansionJob | null>(null);
  const [expandedResult, setExpandedResult] = useState<KeywordExpansionResult | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [seedRunHistory, setSeedRunHistory] = useState<KeywordSeedRunHistoryRow[]>([]);
  const [projects, setProjects] = useState<SeoProject[]>([]);
  const [showProjectList, setShowProjectList] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const seedKeywords = useMemo(
    () => seedKeywordsText.split('\n').map((item) => item.trim()).filter(Boolean),
    [seedKeywordsText]
  );
  const competitorDomains = useMemo(
    () => (formData.competitorDomains || []).map((item: string) => normalizeDomain(item)).filter(Boolean),
    [formData.competitorDomains]
  );
  const clientWebsites = useMemo(
    () => (formData.clientWebsites || []).map((item: string) => normalizeDomain(item)).filter(Boolean),
    [formData.clientWebsites]
  );
  const keywordCount = expandedResult?.keywords.length || 0;

  useEffect(() => {
    if (activePanel === 'keywords' && !expandedResult) {
      setActivePanel(seedKeywords.length ? 'seeds' : 'business');
    }
  }, [activePanel, expandedResult, seedKeywords.length]);

  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => {
      const name = (project.business_name || '').toLowerCase();
      const website = (project.website_url || '').toLowerCase();
      return name.includes(query) || website.includes(query);
    });
  }, [projectSearch, projects]);

  const sidebarSteps = useMemo(
    () => [
      {
        id: 'business',
        label: 'Business Context',
        state: (seedKeywords.length ? 'complete' : activePanel === 'business' ? 'active' : 'pending') as
          | 'pending'
          | 'active'
          | 'complete',
      },
      {
        id: 'seeds',
        label: 'Seed Keywords',
        badge: seedKeywords.length,
        state: (expandedResult
          ? 'complete'
          : activePanel === 'seeds'
          ? 'active'
          : seedKeywords.length
          ? 'complete'
          : 'pending') as 'pending' | 'active' | 'complete',
      },
      {
        id: 'keywords',
        label: 'Expanded Keywords',
        badge: keywordCount,
        state: (activePanel === 'keywords' ? 'active' : keywordCount ? 'complete' : 'pending') as
          | 'pending'
          | 'active'
          | 'complete',
      },
    ],
    [activePanel, seedKeywords.length, keywordCount, expandedResult]
  );

  const projectName = formData.businessName || undefined;

  const refreshSeedRunHistory = async (nextProjectId: string | null): Promise<KeywordSeedRunHistoryRow[]> => {
    if (!nextProjectId) {
      setSeedRunHistory([]);
      return [];
    }

    try {
      const runs = await listKeywordSeedRuns(nextProjectId);
      setSeedRunHistory(runs);
      return runs;
    } catch {
      setSeedRunHistory([]);
      return [];
    }
  };

  const handleOpenProjects = async () => {
    setProjectSearch('');
    setProjects(await listProjects());
    setShowProjectList(true);
  };

  const ensureProject = async (): Promise<string | null> => {
    if (projectId) return projectId;
    const project = await createProject(formData);
    setProjectId(project.id);
    await refreshSeedRunHistory(project.id);
    return project.id;
  };

  const handleGenerateSeeds = async (e: FormEvent) => {
    e.preventDefault();
    setGenerating('seeds');
    setError('');

    try {
      const nextProjectId = await ensureProject();
      const response = await generateSeedKeywords(formData);
      const seeds = response.seeds;
      if (!seeds.length) {
        throw new Error('No seed keywords were returned from Step 1.');
      }

      const nextSeedKeywordsText = seeds.join('\n');
      setSeedKeywordsText(nextSeedKeywordsText);
      setDraftSeedKeywordsText(nextSeedKeywordsText);
      setIsEditingSeeds(false);
      setExpandedResult(null);
      setJob(null);
      setActivePanel('seeds');
      setProjectId(nextProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate seed keywords');
    } finally {
      setGenerating(null);
    }
  };

  const handleRunExpansion = async () => {
    if (!seedKeywords.length) {
      setError('Add at least one seed keyword before running Step 2.');
      return;
    }

    setGenerating('keywords');
    setError('');
    setJob(null);
    setExpandedResult(null);

    try {
      const nextProjectId = await ensureProject();
      const created = await createKeywordExpansionJob({
        projectId: nextProjectId || undefined,
        seedKeywords,
        competitorDomains,
        clientWebsites,
        locationName: formData.locationName,
      });

      let currentJob = await getKeywordExpansionJob(created.job_id);
      setJob(currentJob);

      while (currentJob.status === 'queued' || currentJob.status === 'running') {
        await sleep(1500);
        currentJob = await getKeywordExpansionJob(created.job_id);
        setJob(currentJob);
      }

      if (currentJob.status !== 'completed') {
        throw new Error(currentJob.error || 'Keyword expansion failed');
      }

      const completedJob = await getKeywordExpansionResult(created.job_id);
      setJob(completedJob);
      setExpandedResult(completedJob.result || null);
      if (nextProjectId && completedJob.result) {
        await saveKeywordResult(nextProjectId, JSON.stringify(completedJob.result));
      }
      await refreshSeedRunHistory(nextProjectId);
      setActivePanel('keywords');
      setProjects(await listProjects());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to expand keywords');
    } finally {
      setGenerating(null);
    }
  };

  const handleStartOver = () => {
    if (generating) return;
    setFormData({ ...initialFormData });
    setActivePanel('business');
    setSeedKeywordsText('');
    setDraftSeedKeywordsText('');
    setIsEditingSeeds(false);
    setError('');
    setJob(null);
    setExpandedResult(null);
    setProjectId(null);
    setSeedRunHistory([]);
  };

  const handleStepClick = (stepId: string) => {
    if (stepId === 'business') {
      setActivePanel('business');
      return;
    }

    if (stepId === 'seeds') {
      setActivePanel('seeds');
      return;
    }

    if (stepId === 'keywords' && expandedResult) {
      setActivePanel('keywords');
    }
  };

  const handleEditSeeds = () => {
    setDraftSeedKeywordsText(seedKeywordsText);
    setIsEditingSeeds(true);
  };

  const handleCancelSeedEdit = () => {
    setDraftSeedKeywordsText(seedKeywordsText);
    setIsEditingSeeds(false);
  };

  const handleSaveSeedEdit = () => {
    const nextSeeds = draftSeedKeywordsText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);

    const nextSeedText = nextSeeds.join('\n');
    setSeedKeywordsText(nextSeedText);
    setDraftSeedKeywordsText(nextSeedText);
    setExpandedResult(null);
    setJob(null);
    setIsEditingSeeds(false);
  };

  const handleUseSeedRun = (run: KeywordSeedRunHistoryRow) => {
    const nextSeedText = run.seeds.join('\n');
    setSeedKeywordsText(nextSeedText);
    setDraftSeedKeywordsText(nextSeedText);
    setExpandedResult(null);
    setJob(null);
    setIsEditingSeeds(false);
  };

  const handleLoadProject = async (project: SeoProject) => {
    const fullProject = await loadProject(project.id);
    setFormData({
      businessName: fullProject.business_name,
      websiteUrl: fullProject.website_url || '',
      businessDescription: fullProject.business_description,
      seoGoals: fullProject.seo_goals,
      focusProductLines: fullProject.focus_product_lines || [],
      mustRankKeywords: fullProject.must_rank_keywords || [],
      competitorDomains: [],
      clientWebsites: fullProject.website_url ? [normalizeDomain(fullProject.website_url)] : [],
      locationName: 'Thailand',
    });
    setProjectId(fullProject.id);
    const seedRuns = await refreshSeedRunHistory(fullProject.id);
    setShowProjectList(false);
    setError('');

    const stored = fullProject.keyword_result;
    if (stored && Array.isArray(stored.keywords) && stored.source_catalog) {
      setExpandedResult(stored as KeywordExpansionResult);
      const nextSeedKeywordsText = (stored.source_catalog.s || []).join('\n');
      setSeedKeywordsText(nextSeedKeywordsText);
      setDraftSeedKeywordsText(nextSeedKeywordsText);
      setIsEditingSeeds(false);
      setFormData((prev: Record<string, any>) => ({
        ...prev,
        competitorDomains: stored.source_catalog.c || [],
        clientWebsites: stored.source_catalog.w || [],
      }));
      setActivePanel('keywords');
    } else {
      setExpandedResult(null);
      setSeedKeywordsText('');
      setDraftSeedKeywordsText('');
      setIsEditingSeeds(false);
      setActivePanel(seedRuns.length ? 'seeds' : 'business');
    }
  };

  const handleDeleteProject = async (id: string) => {
    await deleteProject(id);
    setProjects((prev) => prev.filter((project) => project.id !== id));
    setDeleteConfirmId(null);
    if (projectId === id) {
      handleStartOver();
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f5f5f7]">
      <Header
        projectName={projectName}
        onOpenProjects={handleOpenProjects}
        onNewProject={handleStartOver}
        showActions={!!expandedResult}
      />

      {showProjectList && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-[#e8e8ed]">
              <h2 className="text-[18px] font-semibold text-[#1d1d1f]">Projects</h2>
              <button
                onClick={() => setShowProjectList(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#6e6e73] hover:bg-[#f5f5f7] transition-colors cursor-pointer border-none bg-transparent"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-3">
              <input
                type="text"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Search projects"
                className="w-full rounded-xl border border-[#d2d2d7] bg-[#f5f5f7] px-4 py-2.5 text-[13px] mb-3"
              />

              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl mb-1.5 cursor-pointer hover:bg-[#f5f5f7]"
                  onClick={() => handleLoadProject(project)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium text-[#1d1d1f] truncate">
                      {project.business_name}
                    </div>
                    <div className="text-[11px] text-[#8e8e93]">{formatTimestamp(project.created_at)}</div>
                  </div>
                  {deleteConfirmId === project.id ? (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        className="px-2 py-1 rounded-md text-[11px] font-medium text-white bg-[#ff3b30] border-none"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="px-2 py-1 rounded-md text-[11px] font-medium text-[#6e6e73] bg-[#f5f5f7] border-none"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(project.id);
                      }}
                      className="text-[#8e8e93] border-none bg-transparent cursor-pointer"
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar steps={sidebarSteps} onStepClick={handleStepClick} />

        <main className="flex-1 overflow-hidden flex flex-col bg-white">
          {activePanel === 'business' && (
            <div className="flex flex-col h-full animate-fadeIn">
              <div className="px-7 pt-5 shrink-0">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="text-[22px] font-semibold text-[#1d1d1f] tracking-[-0.5px]">
                      Business Context
                    </div>
                    <div className="text-[13px] text-[#6e6e73] mt-1">
                      Define the business first, then generate root seeds and expand them with search data.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...mockFormData })}
                    className="shrink-0 px-3 py-1.5 text-[12px] font-medium text-[#0071e3] bg-[#e8f1fb] rounded-lg border-none"
                  >
                    Fill Demo
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-7 py-6">
                {error ? (
                  <div className="bg-[#fff5f5] border border-[#fecaca] text-[#dc2626] rounded-xl p-3 text-[13px] mb-4">
                    {error}
                  </div>
                ) : null}

                <form onSubmit={handleGenerateSeeds}>
                  <div className="grid grid-cols-2 gap-4 max-w-[840px]">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#1d1d1f]">Business Name</label>
                      <Input
                        required
                        placeholder="e.g. Aura Bangkok Clinic"
                        value={formData.businessName}
                        onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#1d1d1f]">Website URL</label>
                      <Input
                        placeholder="aurabangkokclinic.com"
                        value={formData.websiteUrl}
                        onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                      />
                    </div>

                    <div className="col-span-2 flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#1d1d1f]">
                        Business Description & Core Offerings
                      </label>
                      <TextArea
                        required
                        value={formData.businessDescription}
                        onChange={(e) => setFormData({ ...formData, businessDescription: e.target.value })}
                        className="!min-h-[120px]"
                      />
                    </div>

                    <div className="col-span-2 flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#1d1d1f]">
                        SEO Objectives & Primary Conversion Action
                      </label>
                      <TextArea
                        required
                        value={formData.seoGoals}
                        onChange={(e) => setFormData({ ...formData, seoGoals: e.target.value })}
                        className="!min-h-[90px]"
                      />
                    </div>

                    <div className="col-span-2 flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#1d1d1f]">Focus Product Lines</label>
                      <DynamicList
                        placeholder="Add a product line and press Enter"
                        items={formData.focusProductLines}
                        onChange={(items) => setFormData({ ...formData, focusProductLines: items })}
                      />
                    </div>

                    <div className="col-span-2 flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#1d1d1f]">Priority Keywords</label>
                      <DynamicList
                        placeholder="Add a keyword and press Enter"
                        items={formData.mustRankKeywords}
                        onChange={(items) => setFormData({ ...formData, mustRankKeywords: items })}
                      />
                    </div>

                    <div className="col-span-2 flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#1d1d1f]">Competitor Domains</label>
                      <DynamicList
                        placeholder="Add a competitor domain and press Enter"
                        items={formData.competitorDomains}
                        onChange={(items) => setFormData({ ...formData, competitorDomains: items })}
                      />
                    </div>

                    <div className="col-span-2 flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#1d1d1f]">Client Websites</label>
                      <DynamicList
                        placeholder="Add a client website and press Enter"
                        items={formData.clientWebsites}
                        onChange={(items) => setFormData({ ...formData, clientWebsites: items })}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 max-w-[220px]">
                      <label className="text-[12px] font-semibold text-[#1d1d1f]">Location Name</label>
                      <Input
                        value={formData.locationName}
                        onChange={(e) => setFormData({ ...formData, locationName: e.target.value })}
                      />
                    </div>

                    <div className="col-span-2 flex items-center gap-2.5 pt-2">
                      <button
                        type="submit"
                        disabled={generating === 'seeds'}
                        className="inline-flex items-center gap-1.5 px-5 py-[9px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] border-none cursor-pointer disabled:opacity-50"
                      >
                        {generating === 'seeds' ? 'Generating Seeds...' : 'Generate Seed Keywords'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activePanel === 'seeds' && (
            <div className="flex flex-col h-full animate-fadeIn">
              <div className="px-7 pt-5 shrink-0">
                <div className="text-[22px] font-semibold text-[#1d1d1f] tracking-[-0.5px]">
                  Seed Keywords
                </div>
                <div className="text-[13px] text-[#6e6e73] mt-1">
                  Review the Step 1 output from Claude Sonnet 4.6 before running keyword expansion.
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-7 py-6">
                {error ? (
                  <div className="bg-[#fff5f5] border border-[#fecaca] text-[#dc2626] rounded-xl p-3 text-[13px] mb-4">
                    {error}
                  </div>
                ) : null}

                {!seedKeywords.length ? (
                  <div className="max-w-[960px] space-y-4">
                    <div className="rounded-2xl border border-[#e8e8ed] bg-[#fafafa] p-6">
                      <div className="text-[18px] font-semibold text-[#1d1d1f]">No seed keywords selected</div>
                      <div className="text-[13px] text-[#6e6e73] mt-2 leading-relaxed">
                        Run Step 1 from Business Context to generate a new seed set, or choose a previous seed run below.
                      </div>
                      <div className="flex items-center gap-2.5 pt-4">
                        <button
                          type="button"
                          onClick={() => setActivePanel('business')}
                          className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] border-none cursor-pointer"
                        >
                          Go to Business Context
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenProjects}
                          className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-[#6e6e73] bg-[#f5f5f7] border border-[#d2d2d7] cursor-pointer"
                        >
                          Open Projects
                        </button>
                      </div>
                    </div>

                    {seedRunHistory.length ? (
                      <div className="rounded-xl border border-[#e8e8ed] bg-white overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e8ed] bg-[#fafafa]">
                          <div>
                            <div className="text-[12px] font-semibold text-[#1d1d1f]">Previous Seed Runs</div>
                            <div className="text-[11px] text-[#8e8e93] mt-0.5">
                              Select a seed set that was already used in an earlier run.
                            </div>
                          </div>
                          <div className="text-[12px] font-mono text-[#6e6e73]">{seedRunHistory.length} runs</div>
                        </div>

                        <div className="divide-y divide-[#f1f1f4]">
                          {seedRunHistory.map((run) => (
                            <div key={run.id} className="px-4 py-3 flex items-center gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-medium text-[#1d1d1f]">
                                  {formatTimestamp(run.created_at)} · {run.seeds.length} seeds
                                </div>
                                <div className="text-[12px] text-[#6e6e73] mt-1">
                                  Status: {run.status} · Keywords: {run.deduped_keywords} · API Calls: {run.total_api_calls}
                                </div>
                                <div className="text-[12px] text-[#8e8e93] mt-1 truncate">
                                  {run.seeds.join(', ')}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleUseSeedRun(run)}
                                className="shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[#0071e3] bg-[#e8f1fb] border-none cursor-pointer"
                              >
                                Use Seed Set
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                <div className="grid max-w-[1180px] gap-4 xl:grid-cols-[minmax(0,640px)_minmax(320px,1fr)]">
                  <div className="rounded-xl border border-[#e8e8ed] bg-white overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e8ed] bg-[#fafafa]">
                      <div>
                        <div className="text-[12px] font-semibold text-[#1d1d1f]">
                          Root Seed Keywords
                        </div>
                        <div className="text-[11px] text-[#8e8e93] mt-0.5">
                          Step 1 output from Claude Sonnet 4.6
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-[12px] font-mono text-[#6e6e73]">{seedKeywords.length} seeds</div>
                        {!isEditingSeeds ? (
                          <button
                            type="button"
                            onClick={handleEditSeeds}
                            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-[#0071e3] bg-[#e8f1fb] border-none cursor-pointer"
                          >
                            Edit Seeds
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {isEditingSeeds ? (
                      <div className="p-4">
                        <TextArea
                          value={draftSeedKeywordsText}
                          onChange={(e) => setDraftSeedKeywordsText(e.target.value)}
                          className="!min-h-[260px]"
                        />
                        <div className="text-[12px] text-[#8e8e93] mt-2">
                          One seed per line. You can add, remove, or rewrite seeds before running Step 2.
                        </div>
                        <div className="flex items-center gap-2.5 pt-3">
                          <button
                            type="button"
                            onClick={handleSaveSeedEdit}
                            className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] border-none cursor-pointer"
                          >
                            Save Seeds
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelSeedEdit}
                            className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-[#6e6e73] bg-[#f5f5f7] border border-[#d2d2d7] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4">
                        <div className="rounded-xl border border-[#eef0f3] bg-[#fcfcfd] p-3">
                          <div className="grid gap-2 sm:grid-cols-2">
                            {seedKeywords.map((seed, index) => (
                              <div
                                key={`${seed}-${index}`}
                                className="flex items-start gap-3 rounded-lg border border-[#edf0f3] bg-white px-3 py-2.5"
                              >
                                <div className="mt-0.5 shrink-0 rounded-full bg-[#f5f5f7] px-2 py-0.5 text-[11px] font-mono text-[#6e6e73]">
                                  {index + 1}
                                </div>
                                <div className="min-w-0 text-[13px] leading-5 text-[#1d1d1f] break-words">
                                  {seed}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafa] p-4">
                      <div className="text-[12px] font-semibold text-[#1d1d1f]">Next Step</div>
                      <div className="text-[12px] text-[#6e6e73] mt-1 leading-5">
                        Confirm this seed set, then run Step 2 to expand keywords and load the results table.
                      </div>
                      <div className="flex flex-col gap-2.5 pt-4">
                        <button
                          type="button"
                          onClick={handleRunExpansion}
                          disabled={generating === 'keywords'}
                          className="inline-flex items-center justify-center gap-1.5 px-5 py-[10px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] border-none cursor-pointer disabled:opacity-50"
                        >
                          {generating === 'keywords' ? 'Running Step 2...' : 'Run Keyword Expansion'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActivePanel('business')}
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-[#6e6e73] bg-white border border-[#d2d2d7] cursor-pointer"
                        >
                          Back to Business Context
                        </button>
                      </div>
                    </div>

                    {job ? (
                      <div className="rounded-xl border border-[#e8e8ed] bg-white p-4 text-[13px] text-[#1d1d1f]">
                        <div className="text-[12px] font-semibold text-[#1d1d1f] mb-2">Latest Job</div>
                        <div><strong>Job ID:</strong> {job.job_id}</div>
                        <div><strong>Status:</strong> {job.status}</div>
                        <div><strong>Phase:</strong> {job.progress.phase}</div>
                        <div><strong>Message:</strong> {job.progress.message || '-'}</div>
                        <div><strong>API Calls:</strong> {job.progress.total_api_calls}</div>
                      </div>
                    ) : null}

                    {seedRunHistory.length ? (
                    <div className="rounded-xl border border-[#e8e8ed] bg-white overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e8ed] bg-[#fafafa]">
                        <div>
                          <div className="text-[12px] font-semibold text-[#1d1d1f]">Previous Seed Runs</div>
                          <div className="text-[11px] text-[#8e8e93] mt-0.5">
                            Reuse seed sets from earlier keyword expansion runs for this project.
                          </div>
                        </div>
                        <div className="text-[12px] font-mono text-[#6e6e73]">{seedRunHistory.length} runs</div>
                      </div>

                      <div className="divide-y divide-[#f1f1f4]">
                        {seedRunHistory.map((run) => (
                          <div key={run.id} className="px-4 py-3 flex items-center gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium text-[#1d1d1f]">
                                {formatTimestamp(run.created_at)} · {run.seeds.length} seeds
                              </div>
                              <div className="text-[12px] text-[#6e6e73] mt-1">
                                Status: {run.status} · Keywords: {run.deduped_keywords} · API Calls: {run.total_api_calls}
                              </div>
                              <div className="text-[12px] text-[#8e8e93] mt-1 truncate">
                                {run.seeds.join(', ')}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleUseSeedRun(run)}
                              className="shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[#0071e3] bg-[#e8f1fb] border-none cursor-pointer"
                            >
                              Use Seed Set
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    ) : null}
                  </div>
                </div>
                )}
              </div>
            </div>
          )}

          {activePanel === 'keywords' && (
            <div className="flex flex-col h-full animate-fadeIn">
              <div className="px-7 pt-5 shrink-0">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="text-[22px] font-semibold text-[#1d1d1f] tracking-[-0.5px]">
                      Expanded Keywords
                    </div>
                    <div className="text-[13px] text-[#6e6e73] mt-1">
                      Step 2 output with keyword and search volume locked as required columns.
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto px-7 pb-7">
                {expandedResult ? (
                  <>
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafa] p-4">
                        <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Keywords</div>
                        <div className="text-[22px] font-semibold text-[#1d1d1f] mt-1">
                          {expandedResult.summary.deduped_keywords}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafa] p-4">
                        <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Seed Rows</div>
                        <div className="text-[22px] font-semibold text-[#1d1d1f] mt-1">
                          {expandedResult.summary.total_seed_rows}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafa] p-4">
                        <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Competitor Rows</div>
                        <div className="text-[22px] font-semibold text-[#1d1d1f] mt-1">
                          {expandedResult.summary.total_competitor_rows}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafa] p-4">
                        <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Client Website Rows</div>
                        <div className="text-[22px] font-semibold text-[#1d1d1f] mt-1">
                          {expandedResult.summary.total_client_website_rows}
                        </div>
                      </div>
                    </div>

                    <ExpandedKeywordTable
                      rows={expandedResult.keywords}
                      projectName={formData.businessName}
                      sourceCatalog={expandedResult.source_catalog}
                    />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-3 px-6 py-16 text-center">
                    <div className="text-[15px] font-semibold text-[#1d1d1f]">No expanded keywords yet</div>
                    <div className="text-[13px] text-[#6e6e73] max-w-[300px] leading-relaxed">
                      Generate seeds first, then run keyword expansion to see the Step 2 table here.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
