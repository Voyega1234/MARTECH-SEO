import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { DynamicList } from './components/DynamicList';
import { ExpandedKeywordTable } from './components/ExpandedKeywordTable';
import { Header } from './components/Header';
import { Input } from './components/Input';
import { PaaBlogWorkspace } from './components/PaaBlogWorkspace';
import { Sidebar } from './components/Sidebar';
import { TextArea } from './components/TextArea';
import { WorkspaceTabs } from './components/WorkspaceTabs';
import {
  createPaaBlogJob,
  createKeywordExpansionJob,
  createKeywordGroupingJob,
  filterRelevantKeywords,
  generateSeedKeywords,
  getPaaBlogJob,
  getKeywordExpansionJob,
  getKeywordExpansionResult,
  getKeywordGroupingJob,
} from './features/keyword-expansion/api';
import type {
  KeywordExpansionJob,
  KeywordExpansionKeywordRow,
  KeywordGroupingFinalResponse,
  KeywordGroupingJobDetail,
  KeywordGroupingPlanResponse,
  KeywordExpansionResult,
  PaaBlogJobDetail,
} from './features/keyword-expansion/types';
import {
  clearKeywordProjectSnapshot,
  createProject,
  deleteProject,
  listProjects,
  loadProject,
  saveKeywordResult,
  type SeoProject,
} from './services/projects';
import {
  clearKeywordWorkflowRuns,
  listKeywordSeedRuns,
  loadLatestKeywordGroupingResult,
  loadLatestKeywordExpansionResult,
  saveKeywordGroupingResult,
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
  locationName: 'Thailand',
};

type ActivePanel = 'business' | 'seeds' | 'keywords' | 'grouping';
type ActiveWorkspace = 'keyword' | 'paa-blog';
type GeneratingState = null | 'seeds' | 'keywords';
const GROUPING_PLAN_BATCH_SIZE = 2500;
const DEFAULT_PRE_RELEVANCE_MIN_SEARCH_VOLUME = 0;

type GroupingRunProgress = {
  stage: 'preparing' | 'planning' | 'merging' | 'finalizing';
  totalBatches: number;
  completedBatches: number;
  currentBatch: number;
  inputKeywordCount: number;
  message: string;
};

const GROUPING_JOB_STORAGE_KEY = 'martech-seo-grouping-job-id';

type StoredGroupingJobRef = {
  jobId: string;
  projectId: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readStoredGroupingJobRef(): StoredGroupingJobRef | null {
  const raw = localStorage.getItem(GROUPING_JOB_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.jobId === 'string') {
      return {
        jobId: parsed.jobId,
        projectId: typeof parsed.projectId === 'string' ? parsed.projectId : null,
      };
    }
  } catch {
    // Backward compatibility for older plain-string job ids.
    return { jobId: raw, projectId: null };
  }

  return null;
}

function writeStoredGroupingJobRef(value: StoredGroupingJobRef) {
  localStorage.setItem(GROUPING_JOB_STORAGE_KEY, JSON.stringify(value));
}

function clearStoredGroupingJobRef() {
  localStorage.removeItem(GROUPING_JOB_STORAGE_KEY);
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

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

function sortStep3Keywords(rows: KeywordExpansionKeywordRow[]) {
  return [...rows]
    .sort((a, b) => {
      const aVolume = typeof a.search_volume === 'number' ? a.search_volume : -1;
      const bVolume = typeof b.search_volume === 'number' ? b.search_volume : -1;
      if (bVolume !== aVolume) return bVolume - aVolume;
      return a.keyword.localeCompare(b.keyword);
    });
}

function getRelevantKeywordCount(result: KeywordExpansionResult | null): number {
  if (!result) return 0;
  const metadataCount = Number(result?.metadata?.relevant_keyword_count);
  if (Number.isFinite(metadataCount) && metadataCount >= 0) {
    return metadataCount;
  }
  return Array.isArray(result.keywords) ? result.keywords.length : 0;
}

function applyPreRelevanceFilters(
  rows: KeywordExpansionKeywordRow[],
  options: {
    minSearchVolume: number;
    competitorMaxRank: number | null;
    clientMaxRank: number | null;
  }
): KeywordExpansionKeywordRow[] {
  return rows.filter((row) => {
    const volume = typeof row.search_volume === 'number' ? row.search_volume : 0;
    if (volume < options.minSearchVolume) return false;

    if (
      options.competitorMaxRank !== null &&
      (typeof row.best_competitor_rank_group !== 'number' || row.best_competitor_rank_group > options.competitorMaxRank)
    ) {
      return false;
    }

    if (
      options.clientMaxRank !== null &&
      (typeof row.best_client_website_rank_group !== 'number' ||
        row.best_client_website_rank_group > options.clientMaxRank)
    ) {
      return false;
    }

    return true;
  });
}

function mapGroupingJobToUiProgress(job: KeywordGroupingJobDetail): GroupingRunProgress {
  const phase = job.progress.phase;
  return {
    stage:
      phase === 'planning'
        ? 'planning'
        : phase === 'merging_plan'
        ? 'merging'
        : phase === 'final_grouping'
        ? 'finalizing'
        : 'preparing',
    totalBatches:
      phase === 'planning'
        ? Math.max(job.progress.total_plan_batches, 1)
        : Math.max(job.progress.total_final_batches || job.progress.total_plan_batches, 1),
    completedBatches:
      phase === 'planning'
        ? job.progress.completed_plan_batches
        : job.progress.completed_final_batches || 0,
    currentBatch: job.progress.current_batch || 0,
    inputKeywordCount: job.progress.input_keyword_count,
    message: job.progress.message || 'Processing keyword grouping job',
  };
}

export default function NewApp() {
  const [formData, setFormData] = useState<Record<string, any>>({ ...initialFormData });
  const [activeWorkspace, setActiveWorkspace] = useState<ActiveWorkspace>('keyword');
  const [activePanel, setActivePanel] = useState<ActivePanel>('business');
  const [generating, setGenerating] = useState<GeneratingState>(null);
  const [seedKeywordsText, setSeedKeywordsText] = useState('');
  const [draftSeedKeywordsText, setDraftSeedKeywordsText] = useState('');
  const [isEditingSeeds, setIsEditingSeeds] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState<KeywordExpansionJob | null>(null);
  const [expandedResult, setExpandedResult] = useState<KeywordExpansionResult | null>(null);
  const [filteredKeywordRows, setFilteredKeywordRows] = useState<KeywordExpansionKeywordRow[]>([]);
  const [savedFilteredKeywordRows, setSavedFilteredKeywordRows] = useState<KeywordExpansionKeywordRow[]>([]);
  const [savedFilterUpdatedAt, setSavedFilterUpdatedAt] = useState<string | null>(null);
  const [groupingPlanResult, setGroupingPlanResult] = useState<KeywordGroupingPlanResponse | null>(null);
  const [groupingPlanLoading, setGroupingPlanLoading] = useState(false);
  const [groupingPlanError, setGroupingPlanError] = useState('');
  const [groupingFinalResult, setGroupingFinalResult] = useState<KeywordGroupingFinalResponse | null>(null);
  const [groupingFinalError, setGroupingFinalError] = useState('');
  const [groupingRunProgress, setGroupingRunProgress] = useState<GroupingRunProgress | null>(null);
  const [groupingElapsedSeconds, setGroupingElapsedSeconds] = useState(0);
  const [groupingPreviewMode, setGroupingPreviewMode] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [seedRunHistory, setSeedRunHistory] = useState<KeywordSeedRunHistoryRow[]>([]);
  const [projects, setProjects] = useState<SeoProject[]>([]);
  const [showProjectList, setShowProjectList] = useState(false);
  const [projectListError, setProjectListError] = useState('');
  const [projectLoadingName, setProjectLoadingName] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [paaGroupingResult, setPaaGroupingResult] = useState<KeywordGroupingFinalResponse | null>(null);
  const [paaGroupingLoading, setPaaGroupingLoading] = useState(false);
  const [paaBlogJob, setPaaBlogJob] = useState<PaaBlogJobDetail | null>(null);
  const [paaBlogError, setPaaBlogError] = useState('');
  const [paaBlogRunning, setPaaBlogRunning] = useState(false);
  const [preRelevanceMinSearchVolume, setPreRelevanceMinSearchVolume] = useState(
    DEFAULT_PRE_RELEVANCE_MIN_SEARCH_VOLUME
  );
  const [preRelevanceCompetitorMaxRank, setPreRelevanceCompetitorMaxRank] = useState('');
  const [preRelevanceClientMaxRank, setPreRelevanceClientMaxRank] = useState('');
  const [showAdvancedExpansionOptions, setShowAdvancedExpansionOptions] = useState(false);

  const seedKeywords = useMemo(
    () => seedKeywordsText.split('\n').map((item) => item.trim()).filter(Boolean),
    [seedKeywordsText]
  );
  const competitorDomains = useMemo(
    () => (formData.competitorDomains || []).map((item: string) => normalizeDomain(item)).filter(Boolean),
    [formData.competitorDomains]
  );
  const clientWebsites = useMemo(
    () => [normalizeDomain(formData.websiteUrl || '')].filter(Boolean),
    [formData.websiteUrl]
  );
  const keywordCount = expandedResult?.keywords.length || 0;
  const relevantKeywordCount = getRelevantKeywordCount(expandedResult);
  const groupingPillarCount = groupingPlanResult
    ? groupingPlanResult.plan.product_lines.reduce((sum, productLine) => sum + productLine.pillars.length, 0)
    : 0;
  const isGroupingPreviewOnly = groupingPreviewMode || Boolean(groupingFinalResult?.result.preview_only);
  const step3Running = groupingPlanLoading;
  const filteredKeywordSignature = useMemo(
    () => filteredKeywordRows.map((row) => row.keyword).join('\u0001'),
    [filteredKeywordRows]
  );
  const savedFilteredKeywordSignature = useMemo(
    () => savedFilteredKeywordRows.map((row) => row.keyword).join('\u0001'),
    [savedFilteredKeywordRows]
  );
  const isCurrentFilterSaved =
    filteredKeywordSignature === savedFilteredKeywordSignature && filteredKeywordRows.length === savedFilteredKeywordRows.length;

  useEffect(() => {
    if (activeWorkspace !== 'paa-blog' || !projectId) {
      setPaaGroupingResult(null);
      setPaaGroupingLoading(false);
      return;
    }

    let active = true;

    const loadPaaGrouping = async () => {
      setPaaGroupingLoading(true);
      try {
        const latest = await loadLatestKeywordGroupingResult(projectId);
        if (!active) return;
        setPaaGroupingResult(latest);
      } catch {
        if (!active) return;
        setPaaGroupingResult(null);
      } finally {
        if (active) {
          setPaaGroupingLoading(false);
        }
      }
    };

    void loadPaaGrouping();

    return () => {
      active = false;
    };
  }, [activeWorkspace, projectId]);

  useEffect(() => {
    if (!groupingPlanLoading) {
      setGroupingElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setGroupingElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [groupingPlanLoading]);

  useEffect(() => {
    const storedJob = readStoredGroupingJobRef();
    if (!storedJob || !expandedResult || groupingPlanLoading || !projectId) {
      return;
    }

    if (storedJob.projectId && storedJob.projectId !== projectId) {
      clearStoredGroupingJobRef();
      return;
    }

    let active = true;

    const resumeGroupingJob = async () => {
      try {
        setGroupingPlanLoading(true);
        setActivePanel('grouping');
        let currentJob = await getKeywordGroupingJob(storedJob.jobId);
        if (!active) return;

        setGroupingPreviewMode(Boolean(currentJob.preview_only || currentJob.result?.preview_only));
        setGroupingRunProgress(mapGroupingJobToUiProgress(currentJob));

        while (currentJob.status === 'queued' || currentJob.status === 'running') {
          await sleep(1500);
          currentJob = await getKeywordGroupingJob(storedJob.jobId);
          if (!active) return;
          setGroupingRunProgress(mapGroupingJobToUiProgress(currentJob));
        }

        clearStoredGroupingJobRef();

        if (currentJob.status === 'completed' && currentJob.result) {
          if (currentJob.plan) {
            setGroupingPlanResult({
              success: true,
              plan: currentJob.plan,
              raw: currentJob.plan_raw || '',
              input_keyword_count: currentJob.progress.input_keyword_count,
              used_keyword_count: currentJob.progress.input_keyword_count,
              truncated: false,
              batch_count: currentJob.progress.total_plan_batches,
            });
          } else {
            setGroupingPlanResult(null);
          }

          const finalResponse: KeywordGroupingFinalResponse = {
            success: true,
            result: currentJob.result,
            raw: currentJob.raw || '',
          };
          setGroupingFinalResult(finalResponse);
          setGroupingPreviewMode(Boolean(currentJob.result.preview_only));
          if (projectId && !currentJob.result.preview_only) {
            await saveKeywordGroupingResult(projectId, finalResponse);
          }
          setGroupingPlanError('');
          setGroupingFinalError('');
        } else if (currentJob.status === 'failed') {
          const message = currentJob.error || 'Failed to generate keyword grouping output';
          setGroupingPlanError(message);
          setGroupingFinalError(message);
          setGroupingPreviewMode(false);
        }
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Failed to resume keyword grouping job';
        setGroupingPlanError(message);
        setGroupingFinalError(message);
        setGroupingPreviewMode(false);
      } finally {
        if (active) {
          setGroupingPlanLoading(false);
          setGroupingRunProgress(null);
        }
      }
    };

    void resumeGroupingJob();

    return () => {
      active = false;
    };
  }, [expandedResult, groupingPlanLoading, projectId]);

  useEffect(() => {
    if ((activePanel === 'keywords' || activePanel === 'grouping') && !expandedResult) {
      setActivePanel(seedKeywords.length ? 'seeds' : 'business');
    }
  }, [activePanel, expandedResult, seedKeywords.length]);

  useEffect(() => {
    if (
      activePanel !== 'grouping' ||
      !projectId ||
      !expandedResult ||
      groupingFinalResult ||
      groupingPlanLoading ||
      readStoredGroupingJobRef()
    ) {
      return;
    }

    let active = true;

    const loadGrouping = async () => {
      try {
        const latestGroupingResult = await loadLatestKeywordGroupingResult(projectId);
        if (!active || !latestGroupingResult) return;
        setGroupingFinalResult(latestGroupingResult);
        setGroupingPreviewMode(Boolean(latestGroupingResult.result.preview_only));
      } catch {
        // Ignore lazy-load failures and keep the UI usable.
      }
    };

    void loadGrouping();

    return () => {
      active = false;
    };
  }, [activePanel, expandedResult, groupingFinalResult, groupingPlanLoading, projectId]);

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
      {
        id: 'grouping',
        label: 'Grouping Plan',
        badge: groupingPillarCount || undefined,
        state: (activePanel === 'grouping'
          ? 'active'
          : groupingPlanResult || expandedResult
          ? 'complete'
          : 'pending') as 'pending' | 'active' | 'complete',
      },
    ],
    [activePanel, seedKeywords.length, keywordCount, expandedResult, groupingPlanResult, groupingPillarCount]
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
    setProjectListError('');
    setShowProjectList(true);
    try {
      setProjects(await listProjects());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load projects';
      setProjectListError(message);
      setError(message);
    }
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
      if (nextProjectId) {
        await clearKeywordWorkflowRuns(nextProjectId);
        await clearKeywordProjectSnapshot(nextProjectId);
      }
      const created = await createKeywordExpansionJob({
        projectId: nextProjectId || undefined,
        seedKeywords,
        competitorDomains,
        clientWebsites,
        locationName: formData.locationName,
        persistRawKeywords: false,
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
      let nextExpandedResult = completedJob.result || null;
      if (nextExpandedResult?.keywords?.length) {
        const originalKeywordCount = nextExpandedResult.keywords.length;
        const prefilteredKeywords = applyPreRelevanceFilters(nextExpandedResult.keywords, {
          minSearchVolume: preRelevanceMinSearchVolume,
          competitorMaxRank: preRelevanceCompetitorMaxRank.trim() ? Number(preRelevanceCompetitorMaxRank) : null,
          clientMaxRank: preRelevanceClientMaxRank.trim() ? Number(preRelevanceClientMaxRank) : null,
        });

        if (!prefilteredKeywords.length) {
          throw new Error('Pre-filter removed all keywords. Lower the min volume or relax the rank filters.');
        }

        setJob({
          ...completedJob,
          status: 'running',
          progress: {
            ...completedJob.progress,
            phase: 'relevance_filter',
            message:
              prefilteredKeywords.length === originalKeywordCount
                ? `Checking relevance for ${prefilteredKeywords.length} keywords with Claude Haiku 4.5`
                : `Checking relevance for ${prefilteredKeywords.length} of ${originalKeywordCount} keywords after pre-filter`,
            current_item: null,
          },
        });
        const relevanceResult = await filterRelevantKeywords(formData, prefilteredKeywords);
        nextExpandedResult = {
          ...nextExpandedResult,
          summary: {
            ...nextExpandedResult.summary,
            deduped_keywords: relevanceResult.relevant_keyword_count,
          },
          keywords: relevanceResult.relevant_keywords,
        };
      }

      setJob({
        ...completedJob,
        result: nextExpandedResult || completedJob.result,
        progress: {
          ...completedJob.progress,
          phase: 'completed',
          message: nextExpandedResult?.keywords?.length
            ? `Keyword expansion complete. Relevant keyword set prepared (${nextExpandedResult.keywords.length} keywords).`
            : completedJob.progress.message,
        },
      });

      setExpandedResult(nextExpandedResult);
      setFilteredKeywordRows(nextExpandedResult?.keywords || []);
      setSavedFilteredKeywordRows(nextExpandedResult?.keywords || []);
      setSavedFilterUpdatedAt(new Date().toISOString());
      setGroupingPlanResult(null);
      setGroupingPlanError('');
      setGroupingFinalResult(null);
      setGroupingFinalError('');
      if (nextProjectId && nextExpandedResult) {
        await saveKeywordResult(nextProjectId, JSON.stringify(nextExpandedResult));
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
    setFilteredKeywordRows([]);
    setSavedFilteredKeywordRows([]);
    setSavedFilterUpdatedAt(null);
    setGroupingPlanResult(null);
    setGroupingPlanError('');
    setGroupingFinalResult(null);
    setGroupingFinalError('');
    setGroupingRunProgress(null);
    setProjectId(null);
    setSeedRunHistory([]);
    setPaaGroupingResult(null);
    setPaaGroupingLoading(false);
    setPaaBlogJob(null);
    setPaaBlogError('');
    setPaaBlogRunning(false);
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
      return;
    }

    if (stepId === 'grouping' && expandedResult) {
      setActivePanel('grouping');
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
    setSavedFilteredKeywordRows([]);
    setSavedFilterUpdatedAt(null);
    setJob(null);
    setGroupingPlanResult(null);
    setGroupingPlanError('');
    setGroupingFinalResult(null);
    setGroupingFinalError('');
    setGroupingRunProgress(null);
    setIsEditingSeeds(false);
  };

  const handleUseSeedRun = (run: KeywordSeedRunHistoryRow) => {
    const nextSeedText = run.seeds.join('\n');
    setSeedKeywordsText(nextSeedText);
    setDraftSeedKeywordsText(nextSeedText);
    setExpandedResult(null);
    setFilteredKeywordRows([]);
    setSavedFilteredKeywordRows([]);
    setSavedFilterUpdatedAt(null);
    setGroupingPlanResult(null);
    setGroupingPlanError('');
    setGroupingFinalResult(null);
    setGroupingFinalError('');
    setGroupingRunProgress(null);
    setJob(null);
    setIsEditingSeeds(false);
  };

  const handleGenerateGroupingPlan = async (previewOnly = false) => {
    if (!savedFilteredKeywordRows.length) {
      setGroupingPlanError('No saved keyword set available for keyword grouping.');
      return;
    }

    setGroupingPlanLoading(true);
    setGroupingPreviewMode(previewOnly);
    setGroupingPlanError('');
    setActivePanel('grouping');
    setGroupingPlanResult(null);
    setGroupingFinalResult(null);
    setGroupingFinalError('');

    try {
      const limitedKeywords = sortStep3Keywords(savedFilteredKeywordRows);
      const estimatedPlanBatches = Math.max(Math.ceil(limitedKeywords.length / GROUPING_PLAN_BATCH_SIZE), 1);
      setGroupingRunProgress({
        stage: 'preparing',
        totalBatches: estimatedPlanBatches,
        completedBatches: 0,
        currentBatch: estimatedPlanBatches ? 1 : 0,
        inputKeywordCount: limitedKeywords.length,
        message: previewOnly
          ? `Preparing ${limitedKeywords.length} keywords for groups preview`
          : `Preparing ${limitedKeywords.length} keywords for keyword grouping`,
      });

      const created = await createKeywordGroupingJob(formData, limitedKeywords, previewOnly);
      writeStoredGroupingJobRef({ jobId: created.job_id, projectId: projectId || null });

      let currentJob = await getKeywordGroupingJob(created.job_id);
      setGroupingRunProgress(mapGroupingJobToUiProgress(currentJob));

      while (currentJob.status === 'queued' || currentJob.status === 'running') {
        await sleep(1500);
        currentJob = await getKeywordGroupingJob(created.job_id);
        setGroupingRunProgress(mapGroupingJobToUiProgress(currentJob));
      }

      clearStoredGroupingJobRef();

      if (currentJob.status !== 'completed' || !currentJob.result) {
        throw new Error(currentJob.error || 'Failed to generate keyword grouping output');
      }

      if (currentJob.plan) {
        setGroupingPlanResult({
          success: true,
          plan: currentJob.plan,
          raw: currentJob.plan_raw || '',
          input_keyword_count: currentJob.progress.input_keyword_count,
          used_keyword_count: currentJob.progress.input_keyword_count,
          truncated: false,
          batch_count: currentJob.progress.total_plan_batches,
        });
      } else {
        setGroupingPlanResult(null);
      }

      const finalResponse: KeywordGroupingFinalResponse = {
        success: true,
        result: currentJob.result,
        raw: currentJob.raw || '',
      };

      setGroupingFinalResult(finalResponse);
      setGroupingPreviewMode(Boolean(currentJob.result.preview_only || previewOnly));
      if (projectId && !currentJob.result.preview_only) {
        await saveKeywordGroupingResult(projectId, finalResponse);
      }
      setGroupingRunProgress(null);
    } catch (err) {
      clearStoredGroupingJobRef();
      const message = err instanceof Error ? err.message : 'Failed to generate keyword grouping output';
      setGroupingPlanError(message);
      setGroupingFinalError(message);
      setGroupingRunProgress(null);
      setGroupingPreviewMode(false);
    } finally {
      setGroupingPlanLoading(false);
    }
  };

  const handleLoadProject = async (project: SeoProject) => {
    clearStoredGroupingJobRef();
    setShowProjectList(false);
    setProjectLoadingName(project.business_name);
    setError('');
    setGroupingPlanLoading(false);
    setGroupingRunProgress(null);
    setPaaBlogJob(null);
    setPaaBlogError('');
    setPaaBlogRunning(false);
    try {
      const [fullProject, latestExpansionResult, seedRuns] = await Promise.all([
        loadProject(project.id),
        loadLatestKeywordExpansionResult(project.id).catch(() => null),
        refreshSeedRunHistory(project.id),
      ]);

      setFormData({
        businessName: fullProject.business_name,
        websiteUrl: fullProject.website_url || '',
        businessDescription: fullProject.business_description,
        seoGoals: fullProject.seo_goals,
        focusProductLines: fullProject.focus_product_lines || [],
        mustRankKeywords: fullProject.must_rank_keywords || [],
        competitorDomains: [],
        locationName: 'Thailand',
      });
      setProjectId(fullProject.id);

      const stored =
        (fullProject.keyword_result && Array.isArray(fullProject.keyword_result.keywords) && fullProject.keyword_result.source_catalog
          ? fullProject.keyword_result
          : null) ||
        latestExpansionResult;
      if (stored && Array.isArray(stored.keywords) && stored.source_catalog) {
        setExpandedResult(stored as KeywordExpansionResult);
        setFilteredKeywordRows(stored.keywords || []);
        setSavedFilteredKeywordRows(stored.keywords || []);
        setSavedFilterUpdatedAt(new Date().toISOString());
        setGroupingPlanResult(null);
        setGroupingPlanError('');
        setGroupingFinalResult(null);
        setGroupingPreviewMode(false);
        setGroupingFinalError('');
        const nextSeedKeywordsText = (stored.source_catalog.s || []).join('\n');
        setSeedKeywordsText(nextSeedKeywordsText);
        setDraftSeedKeywordsText(nextSeedKeywordsText);
        setIsEditingSeeds(false);
        setFormData((prev: Record<string, any>) => ({
          ...prev,
          competitorDomains: stored.source_catalog.c || [],
        }));
        setActivePanel('keywords');
      } else {
        setExpandedResult(null);
        setFilteredKeywordRows([]);
        setSavedFilteredKeywordRows([]);
        setSavedFilterUpdatedAt(null);
        setGroupingPlanResult(null);
        setGroupingPlanError('');
        setGroupingFinalResult(null);
        setGroupingPreviewMode(false);
        setGroupingFinalError('');
        setSeedKeywordsText('');
        setDraftSeedKeywordsText('');
        setIsEditingSeeds(false);
        setActivePanel(seedRuns.length ? 'seeds' : 'business');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setProjectLoadingName(null);
    }
  };

  const handleSaveFilteredKeywords = (rows: KeywordExpansionKeywordRow[]) => {
    setSavedFilteredKeywordRows(rows);
    setSavedFilterUpdatedAt(new Date().toISOString());
    setGroupingPlanResult(null);
    setGroupingPlanError('');
    setGroupingFinalResult(null);
    setGroupingPreviewMode(false);
    setGroupingFinalError('');
  };

  const handleDeleteProject = async (id: string) => {
    await deleteProject(id);
    setProjects((prev) => prev.filter((project) => project.id !== id));
    setDeleteConfirmId(null);
    if (projectId === id) {
      handleStartOver();
    }
  };

  const handleRunPaaBlog = async () => {
    if (!projectId) {
      setPaaBlogError('Select a project before running PAA Blog.');
      return;
    }

    if (!paaGroupingResult?.result?.groups?.length) {
      setPaaBlogError('Latest keyword grouping output is required before running PAA Blog.');
      return;
    }

    setPaaBlogRunning(true);
    setPaaBlogError('');
    setPaaBlogJob(null);

    try {
      const created = await createPaaBlogJob(formData, paaGroupingResult.result);
      let currentJob = await getPaaBlogJob(created.job_id);
      setPaaBlogJob(currentJob);

      while (currentJob.status === 'queued' || currentJob.status === 'running') {
        await sleep(1500);
        currentJob = await getPaaBlogJob(created.job_id);
        setPaaBlogJob(currentJob);
      }

      if (currentJob.status !== 'completed' || !currentJob.result) {
        throw new Error(currentJob.error || 'Failed to generate PAA Blog ideas');
      }

      setPaaBlogJob(currentJob);
    } catch (err) {
      setPaaBlogError(err instanceof Error ? err.message : 'Failed to generate PAA Blog ideas');
    } finally {
      setPaaBlogRunning(false);
    }
  };

  const handleExportPaaBlogCsv = () => {
    const rows = paaBlogJob?.result?.ideas || [];
    if (!rows.length) return;

    const escapeCsv = (value: string) => `"${String(value || '').replace(/"/g, '""')}"`;
    const csv = [
      ['Blog Title', 'Source', 'Source Seed', 'Programmatic Variables'].join(','),
      ...rows.map((row) =>
        [
          escapeCsv(row.blog_title),
          escapeCsv(row.source),
          escapeCsv(row.source_seed),
          escapeCsv(row.programmatic_variables || ''),
        ].join(',')
      ),
    ].join('\n');

    const filenameBase = normalizeDomain(formData.websiteUrl || formData.businessName || 'paa-blog') || 'paa-blog';
    downloadTextFile(`${filenameBase}-paa-blog.csv`, csv, 'text/csv;charset=utf-8;');
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f5f5f7]">
      <Header
        projectName={projectName}
        onOpenProjects={handleOpenProjects}
        onNewProject={handleStartOver}
        showActions={activeWorkspace === 'keyword' && !!expandedResult}
      />

      <WorkspaceTabs activeWorkspace={activeWorkspace} onChange={setActiveWorkspace} />

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

              {projectListError ? (
                <div className="mb-3 rounded-xl border border-[#fecaca] bg-[#fff5f5] px-4 py-3 text-[12px] text-[#b42318]">
                  {projectListError}
                </div>
              ) : null}

              {!projectListError && filteredProjects.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#d2d2d7] bg-[#fcfcfd] px-4 py-6 text-center">
                  <div className="text-[14px] font-medium text-[#1d1d1f]">No projects found</div>
                  <div className="text-[12px] text-[#8e8e93] mt-1">
                    {projects.length === 0
                      ? 'Supabase returned no visible rows for seo_projects.'
                      : 'No projects match the current search.'}
                  </div>
                </div>
              ) : (
                filteredProjects.map((project) => (
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
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {projectLoadingName && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
          <div className="rounded-2xl border border-[#d2d2d7] bg-white px-5 py-4 shadow-xl min-w-[280px]">
            <div className="text-[14px] font-semibold text-[#1d1d1f]">Loading Project</div>
            <div className="text-[13px] text-[#6e6e73] mt-1">{projectLoadingName}</div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {activeWorkspace === 'keyword' ? <Sidebar steps={sidebarSteps} onStepClick={handleStepClick} /> : null}

        <main className="flex-1 overflow-hidden flex flex-col bg-white">
          {activeWorkspace === 'paa-blog' ? (
            <PaaBlogWorkspace
              projectId={projectId}
              formData={formData}
              expandedResult={expandedResult}
              groupingResult={paaGroupingResult}
              groupingLoading={paaGroupingLoading}
              paaJob={paaBlogJob}
              paaError={paaBlogError}
              paaRunning={paaBlogRunning}
              onRun={handleRunPaaBlog}
              onExportCsv={handleExportPaaBlogCsv}
            />
          ) : (
            <>
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
                      <div className="text-[11px] text-[#8e8e93]">
                        Used as the client website source for keyword expansion.
                      </div>
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
                      <div className="pt-4">
                        <div className="overflow-hidden rounded-xl border border-[#e8e8ed] bg-white">
                          <button
                            type="button"
                            onClick={() => setShowAdvancedExpansionOptions((current) => !current)}
                            className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                          >
                            <div>
                              <div className="text-[12px] font-semibold text-[#1d1d1f]">Advanced Options</div>
                              <div className="text-[11px] text-[#8e8e93] mt-0.5">
                                Optional pre-filter before relevance check
                              </div>
                            </div>
                            <div className="text-[16px] leading-none text-[#6e6e73]">
                              {showAdvancedExpansionOptions ? '−' : '+'}
                            </div>
                          </button>

                          {showAdvancedExpansionOptions ? (
                            <div className="grid gap-3 border-t border-[#f1f1f4] px-3 py-3">
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93] mb-1.5">
                                  Min Search Volume
                                </div>
                                <Input
                                  type="number"
                                  min={0}
                                  value={preRelevanceMinSearchVolume}
                                  onChange={(e) =>
                                    setPreRelevanceMinSearchVolume(
                                      e.target.value === '' ? 0 : Math.max(Number(e.target.value), 0)
                                    )
                                  }
                                />
                              </div>
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93] mb-1.5">
                                  Competitor Max Rank
                                </div>
                                <Input
                                  type="number"
                                  min={1}
                                  placeholder="Any"
                                  value={preRelevanceCompetitorMaxRank}
                                  onChange={(e) => setPreRelevanceCompetitorMaxRank(e.target.value)}
                                />
                              </div>
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93] mb-1.5">
                                  Client Max Rank
                                </div>
                                <Input
                                  type="number"
                                  min={1}
                                  placeholder="Any"
                                  value={preRelevanceClientMaxRank}
                                  onChange={(e) => setPreRelevanceClientMaxRank(e.target.value)}
                                />
                              </div>
                            </div>
                            <div className="text-[11px] text-[#8e8e93] leading-5">
                              These filters are applied after Step 2 finishes and before sending keywords into the relevance check.
                            </div>
                            </div>
                          ) : null}
                        </div>
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
                  {expandedResult ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleGenerateGroupingPlan(false)}
                        disabled={step3Running || !savedFilteredKeywordRows.length}
                        className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] border-none cursor-pointer"
                      >
                        {step3Running ? 'Generating Keyword Grouping...' : 'Generate Keyword Grouping'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGenerateGroupingPlan(true)}
                        disabled={step3Running || !savedFilteredKeywordRows.length}
                        className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-[#1d1d1f] bg-white border border-[#d2d2d7] cursor-pointer"
                      >
                        {step3Running ? 'Building Groups Preview...' : 'Preview Groups Only'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex-1 overflow-auto px-7 pb-7">
                {expandedResult ? (
                  <>
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafa] p-4">
                        <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Relevant Keywords</div>
                        <div className="text-[22px] font-semibold text-[#1d1d1f] mt-1">
                          {relevantKeywordCount}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafa] p-4">
                        <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Raw Seed Rows</div>
                        <div className="text-[22px] font-semibold text-[#1d1d1f] mt-1">
                          {expandedResult.summary.total_seed_rows}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafa] p-4">
                        <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Raw Competitor Rows</div>
                        <div className="text-[22px] font-semibold text-[#1d1d1f] mt-1">
                          {expandedResult.summary.total_competitor_rows}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafa] p-4">
                        <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Raw Client Website Rows</div>
                        <div className="text-[22px] font-semibold text-[#1d1d1f] mt-1">
                          {expandedResult.summary.total_client_website_rows}
                        </div>
                      </div>
                    </div>

                    <div className="mb-4 rounded-xl border border-[#e8e8ed] bg-[#fafafa] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-[13px]">
                      <div className="text-[#1d1d1f]">
                        <span className="font-medium">Saved keyword set:</span>{' '}
                        <span className="font-mono">{savedFilteredKeywordRows.length}</span> keywords
                        {savedFilterUpdatedAt ? (
                          <span className="text-[#8e8e93]"> · saved filter applied</span>
                        ) : null}
                      </div>
                      <div className={`font-medium ${isCurrentFilterSaved ? 'text-[#2f855a]' : 'text-[#b45309]'}`}>
                        {isCurrentFilterSaved ? 'Step 3 will use this saved set' : 'Save Filter to update Step 3 input'}
                      </div>
                    </div>

                    <ExpandedKeywordTable
                      rows={expandedResult.keywords}
                      projectName={formData.businessName}
                      sourceCatalog={expandedResult.source_catalog}
                      onFilteredRowsChange={setFilteredKeywordRows}
                      onSaveFilter={handleSaveFilteredKeywords}
                      isCurrentFilterSaved={isCurrentFilterSaved}
                      savedKeywordCount={savedFilteredKeywordRows.length}
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

          {activePanel === 'grouping' && (
            <div className="flex flex-col h-full animate-fadeIn">
              <div className="px-7 pt-5 shrink-0">
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="text-[22px] font-semibold text-[#1d1d1f] tracking-[-0.5px]">
                      {isGroupingPreviewOnly ? 'Groups Preview' : 'Final Grouping Output'}
                      </div>
                      <div className="text-[13px] text-[#6e6e73] mt-1">
                      {isGroupingPreviewOnly
                        ? 'Preview the candidate keyword groups before keyword assignment.'
                        : 'Final keyword grouping table for the current filtered keyword set.'}
                      </div>
                    </div>
                  {expandedResult ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleGenerateGroupingPlan(false)}
                        disabled={step3Running || !savedFilteredKeywordRows.length}
                        className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] border-none cursor-pointer disabled:opacity-50"
                      >
                        {step3Running ? 'Generating Keyword Grouping...' : 'Generate Keyword Grouping'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGenerateGroupingPlan(true)}
                        disabled={step3Running || !savedFilteredKeywordRows.length}
                        className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-[#1d1d1f] bg-white border border-[#d2d2d7] cursor-pointer disabled:opacity-50"
                      >
                        {step3Running ? 'Building Groups Preview...' : 'Preview Groups Only'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex-1 overflow-auto px-7 pb-7">
                {expandedResult ? (
                  <div className="space-y-6">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafa] p-4">
                        <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Saved Keywords</div>
                        <div className="text-[22px] font-semibold text-[#1d1d1f] mt-1">
                          {savedFilteredKeywordRows.length}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafa] p-4">
                        <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Groups</div>
                        <div className="text-[22px] font-semibold text-[#1d1d1f] mt-1">
                          {groupingFinalResult ? groupingFinalResult.result.group_count : '-'}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafa] p-4">
                        <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">
                          {isGroupingPreviewOnly ? 'Preview Only' : 'Covered Keywords'}
                        </div>
                        <div className="text-[22px] font-semibold text-[#1d1d1f] mt-1">
                          {groupingFinalResult ? (isGroupingPreviewOnly ? 'Yes' : groupingFinalResult.result.covered_keyword_count) : '-'}
                        </div>
                      </div>
                    </div>

                    {step3Running ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-full max-w-[440px] text-center">
                          <span className="text-[56px] mb-5 block" style={{ animation: 'float 3s ease-in-out infinite' }}>
                            🗂️
                          </span>
                          <div className="text-[18px] font-medium text-[#1d1d1f] mb-1.5">
                            {isGroupingPreviewOnly ? 'Building groups preview...' : 'Building final grouping...'}
                          </div>
                          <div className="text-[13px] text-[#6e6e73] mb-6 leading-relaxed">
                            {isGroupingPreviewOnly
                              ? <>Creating candidate keyword groups for <strong className="text-[#1d1d1f]">{formData.businessName || 'your project'}</strong> before keyword assignment</>
                              : <>Organizing keywords into URL groups and preparing the final table for <strong className="text-[#1d1d1f]">{formData.businessName || 'your project'}</strong></>}
                          </div>
                          <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border bg-[#f0f5ff] border-[rgba(0,122,255,0.3)] text-left">
                            <div className="text-[18px] w-7 text-center shrink-0 leading-none">🔎</div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium text-[#0071e3]">Researching group structure</div>
                              <div className="text-[11px] mt-0.5 text-[#007aff]">
                                {groupingRunProgress?.message || 'Processing full keyword set'}<span className="animate-pulse">...</span>
                              </div>
                            </div>
                            <div className="text-[11px] shrink-0 tabular-nums text-[#007aff]">
                              {Math.floor(groupingElapsedSeconds / 60)}:{String(groupingElapsedSeconds % 60).padStart(2, '0')}
                            </div>
                          </div>
                          <div className="mt-3 text-[12px] text-[#6e6e73]">
                            Saved keyword set
                            {groupingRunProgress ? ` • ${groupingRunProgress.completedBatches}/${groupingRunProgress.totalBatches} planning batches` : ''}
                          </div>
                        </div>
                      </div>
                    ) : groupingFinalResult ? (
                      <div className="rounded-2xl border border-[#e8e8ed] bg-white overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e8ed] bg-[#fafafa]">
                              <div>
                                <div className="text-[15px] font-semibold text-[#1d1d1f]">
                                  {isGroupingPreviewOnly ? 'Groups Preview' : 'Final Grouping Output'}
                                </div>
                                <div className="text-[12px] text-[#6e6e73] mt-1">
                                  {isGroupingPreviewOnly
                                    ? 'Candidate keyword groups only. No keywords have been assigned yet.'
                                    : 'CSV-ready output for the current filtered keyword pool.'}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-[12px] text-[#6e6e73]">
                                  {groupingFinalResult.result.batch_count} batches
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadTextFile(
                                      `${(formData.businessName || 'keyword-grouping').toLowerCase().replace(/\s+/g, '-')}-step3.csv`,
                                      groupingFinalResult.result.csv,
                                      'text/csv;charset=utf-8;'
                                    )
                                  }
                                  className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] border-none cursor-pointer"
                                >
                                  Export CSV
                                </button>
                              </div>
                            </div>
                            <div className="p-5 space-y-4">
                              <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafa] p-4">
                                  <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Groups</div>
                                  <div className="text-[22px] font-semibold text-[#1d1d1f] mt-1">
                                    {groupingFinalResult.result.group_count}
                                  </div>
                                </div>
                                <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafa] p-4">
                                  <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">
                                    {isGroupingPreviewOnly ? 'Preview Only' : 'Covered Keywords'}
                                  </div>
                                  <div className="text-[22px] font-semibold text-[#1d1d1f] mt-1">
                                    {isGroupingPreviewOnly ? groupingFinalResult.result.covered_keyword_count : groupingFinalResult.result.covered_keyword_count}
                                  </div>
                                </div>
                                <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafa] p-4">
                                  <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Input Keywords</div>
                                  <div className="text-[22px] font-semibold text-[#1d1d1f] mt-1">
                                    {groupingFinalResult.result.input_keyword_count}
                                  </div>
                                </div>
                              </div>
                              <div className="overflow-x-auto rounded-xl border border-[#e8e8ed] bg-white">
                                <table className="min-w-full text-left border-collapse">
                                  <thead className="bg-[#fafafa] border-b border-[#e8e8ed]">
                                    <tr>
                                      <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Product Line</th>
                                      <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Topic Pillar</th>
                                      <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Intent</th>
                                      <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Keyword Group</th>
                                      <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">URL Slug</th>
                                      <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">
                                        {isGroupingPreviewOnly ? 'Keyword Assignment' : 'Level 3 Variations'}
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {groupingFinalResult.result.groups
                                      .filter((group) => group.keywords.length > 0)
                                      .map((group, index) => (
                                      <tr key={`${group.slug}-${index}`} className="border-b border-[#f1f1f4] align-top">
                                        <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{group.product_line}</td>
                                        <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{group.pillar}</td>
                                        <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{group.intent}</td>
                                        <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{group.keyword_group}</td>
                                        <td className="px-4 py-3 text-[12px] text-[#0071e3] font-mono">{group.slug}</td>
                                        <td className="px-4 py-3 min-w-[420px]">
                                          <div className="text-[12px] leading-6 text-[#1d1d1f]">
                                            {isGroupingPreviewOnly ? (
                                              group.keywords.length ? (
                                                group.keywords.map((item, keywordIndex) => (
                                                  <span key={`${group.slug}-${keywordIndex}`} className="mr-2 inline-block">
                                                    <span>{item.keyword}</span>
                                                    <span className="text-[#8e8e93]"> </span>
                                                    <span className="inline-flex items-center rounded-[6px] border border-[#e8e8ed] bg-[#f7f7f9] px-1.5 py-0 text-[10px] font-medium leading-5 text-[#8e8e93]">
                                                      {typeof item.search_volume === 'number' ? item.search_volume : '-'}
                                                    </span>
                                                  </span>
                                                ))
                                              ) : (
                                                <span className="text-[#8e8e93]">Preview only - keywords not assigned yet</span>
                                              )
                                            ) : group.keywords.map((item, keywordIndex) => (
                                              <span key={`${group.slug}-${keywordIndex}`} className="mr-2 inline-block">
                                                <span>{item.keyword}</span>
                                                <span className="text-[#8e8e93]"> </span>
                                                <span className="inline-flex items-center rounded-[6px] border border-[#e8e8ed] bg-[#f7f7f9] px-1.5 py-0 text-[10px] font-medium leading-5 text-[#8e8e93]">
                                                  {typeof item.search_volume === 'number' ? item.search_volume : '-'}
                                                </span>
                                              </span>
                                            ))}
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-[#d2d2d7] bg-[#fafafa] p-4 text-[13px] text-[#6e6e73]">
                        Generate keyword grouping to build the final grouping table from the current filtered keyword set.
                      </div>
                    )}

                    {groupingPlanError || groupingFinalError ? (
                      <div className="bg-[#fff5f5] border border-[#fecaca] text-[#dc2626] rounded-xl p-3 text-[13px]">
                        {groupingFinalError || groupingPlanError}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-3 px-6 py-16 text-center">
                    <div className="text-[15px] font-semibold text-[#1d1d1f]">No expanded keywords yet</div>
                    <div className="text-[13px] text-[#6e6e73] max-w-[320px] leading-relaxed">
                      Complete Step 2 first, then use this tab to generate the final keyword grouping output.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
