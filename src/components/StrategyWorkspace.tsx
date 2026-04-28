import { DynamicList } from './DynamicList';
import { Input } from './Input';
import { TextArea } from './TextArea';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type {
  KeywordExpansionJob,
  KeywordExpansionResult,
  KeywordExpansionKeywordRow,
  SitemapMatchingResponse,
  SitemapRowsResponse,
  SitemapSeedPlanResponse,
  TopicUniverseResponse,
} from '../features/keyword-expansion/types';
import {
  createKeywordExpansionJob,
  getKeywordExpansionCsvUrl,
  getKeywordExpansionJob,
  getKeywordExpansionResult,
  generateSeedsFromSitemap,
  generateSitemapFromUniverse,
  generateTopicUniverse,
  matchKeywordsToSitemap,
} from '../features/keyword-expansion/api';

type StrategyPanel =
  | 'business'
  | 'topic-universe'
  | 'sitemap'
  | 'seeds-from-sitemap'
  | 'expand-from-seeds'
  | 'matching';

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function StepShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="text-[24px] font-semibold text-[#1d1d1f] tracking-[-0.5px]">{title}</div>
        <div className="text-[13px] text-[#6e6e73] mt-2 max-w-[760px]">{description}</div>
      </div>
      {children}
    </div>
  );
}

function StatusCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafa] p-4">
      <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">{label}</div>
      <div className="text-[22px] font-semibold text-[#1d1d1f] mt-1">{value}</div>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d2d2d7] bg-[#fafafa] p-6">
      <div className="text-[15px] font-semibold text-[#1d1d1f]">{title}</div>
      <div className="text-[13px] text-[#6e6e73] mt-2 max-w-[720px]">{description}</div>
    </div>
  );
}

function ActionCard({
  title,
  description,
  primaryLabel,
  onPrimary,
  disabled,
  busy,
  secondary,
}: {
  title: string;
  description: string;
  primaryLabel: string;
  onPrimary: () => void;
  disabled: boolean;
  busy: boolean;
  secondary?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#e8e8ed] bg-white p-5 space-y-4">
      <div>
        <div className="text-[15px] font-semibold text-[#1d1d1f]">{title}</div>
        <div className="text-[13px] text-[#6e6e73] mt-1 max-w-[760px]">{description}</div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onPrimary}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] border-none cursor-pointer disabled:opacity-50"
        >
          {busy ? `${primaryLabel}...` : primaryLabel}
        </button>
        {secondary}
      </div>
    </div>
  );
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

export function StrategyWorkspace({
  activePanel,
  formData,
  setFormData,
  expandedKeywords,
  onNavigateToPanel,
  projectId,
  onEnsureProject,
  onExpansionComplete,
  onKeywordSetSaved,
}: {
  activePanel: StrategyPanel;
  formData: Record<string, any>;
  setFormData: (value: Record<string, any>) => void;
  expandedKeywords: KeywordExpansionKeywordRow[];
  onNavigateToPanel: (panel: StrategyPanel) => void;
  projectId: string | null;
  onEnsureProject: () => Promise<string | null>;
  onExpansionComplete?: (result: KeywordExpansionResult, ensuredProjectId: string | null) => Promise<void> | void;
  onKeywordSetSaved?: (keywords: KeywordExpansionKeywordRow[]) => void;
}) {
  const [topicUniverse, setTopicUniverse] = useState<TopicUniverseResponse | null>(null);
  const [sitemapResult, setSitemapResult] = useState<SitemapRowsResponse | null>(null);
  const [seedPlan, setSeedPlan] = useState<SitemapSeedPlanResponse | null>(null);
  const [editableSeedList, setEditableSeedList] = useState('');
  const [expansionJob, setExpansionJob] = useState<KeywordExpansionJob | null>(null);
  const [expandedKeywordResult, setExpandedKeywordResult] = useState<KeywordExpansionResult | null>(null);
  const [savedExpansionKeywords, setSavedExpansionKeywords] = useState<KeywordExpansionKeywordRow[]>([]);
  const [expansionKeywordQuery, setExpansionKeywordQuery] = useState('');
  const [expansionMinVolume, setExpansionMinVolume] = useState('');
  const [matchingResult, setMatchingResult] = useState<SitemapMatchingResponse | null>(null);
  const [loadingStep, setLoadingStep] = useState<null | 'topic' | 'sitemap' | 'seeds' | 'expansion' | 'matching'>(null);
  const [error, setError] = useState('');

  const canRunTopicUniverse = Boolean(formData.businessName && formData.businessDescription && formData.seoGoals);
  const canRunSitemap = Boolean(topicUniverse?.result.rows.length);
  const canRunSeeds = Boolean(sitemapResult?.result.rows.length);
  const effectiveSeedList = editableSeedList
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  const canRunExpansion = Boolean(effectiveSeedList.length);
  const expansionSourceKeywords = expandedKeywordResult?.keywords || expandedKeywords;
  const filteredExpansionKeywords = expansionSourceKeywords.filter((row) => {
    const query = expansionKeywordQuery.trim().toLowerCase();
    if (query && !row.keyword.toLowerCase().includes(query)) return false;
    const minVolume = expansionMinVolume.trim() ? Number(expansionMinVolume) : null;
    const volume = typeof row.search_volume === 'number' ? row.search_volume : 0;
    if (minVolume !== null && Number.isFinite(minVolume) && volume < minVolume) return false;
    return true;
  });
  const effectiveExpandedKeywords = savedExpansionKeywords.length ? savedExpansionKeywords : expansionSourceKeywords;
  const canRunMatching = Boolean(sitemapResult?.result.rows.length && effectiveExpandedKeywords.length);
  const hasTopicUniverse = Boolean(topicUniverse?.result.rows.length);
  const hasSitemap = Boolean(sitemapResult?.result.rows.length);
  const hasSeedPlan = Boolean(seedPlan?.result.coverage.length);
  const hasExpandedKeywords = Boolean(expandedKeywordResult?.keywords.length || effectiveExpandedKeywords.length);
  const hasMatchingResult = Boolean(matchingResult?.result.rows.length);

  const handleTopicUniverse = async () => {
    try {
      setError('');
      if (activePanel === 'business') {
        onNavigateToPanel('topic-universe');
      }
      setLoadingStep('topic');
      const result = await generateTopicUniverse(formData);
      setTopicUniverse(result);
      setSitemapResult(null);
      setSeedPlan(null);
      setEditableSeedList('');
      setExpansionJob(null);
      setExpandedKeywordResult(null);
      setSavedExpansionKeywords([]);
      setMatchingResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate topic universe');
    } finally {
      setLoadingStep(null);
    }
  };

  const handleSitemap = async () => {
    try {
      if (!topicUniverse) return;
      setError('');
      setLoadingStep('sitemap');
      const result = await generateSitemapFromUniverse(formData, topicUniverse.result.rows);
      setSitemapResult(result);
      setSeedPlan(null);
      setEditableSeedList('');
      setExpansionJob(null);
      setExpandedKeywordResult(null);
      setSavedExpansionKeywords([]);
      setMatchingResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate sitemap');
    } finally {
      setLoadingStep(null);
    }
  };

  const handleSeeds = async () => {
    try {
      if (!sitemapResult) return;
      setError('');
      setLoadingStep('seeds');
      const result = await generateSeedsFromSitemap(formData, sitemapResult.result.rows);
      setSeedPlan(result);
      setEditableSeedList(result.result.seeds.join('\n'));
      setExpansionJob(null);
      setExpandedKeywordResult(null);
      setSavedExpansionKeywords([]);
      setMatchingResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate sitemap-based seeds');
    } finally {
      setLoadingStep(null);
    }
  };

  const handleExpansion = async () => {
    try {
      if (!effectiveSeedList.length) return;
      setError('');
      if (activePanel !== 'expand-from-seeds') {
        onNavigateToPanel('expand-from-seeds');
      }
      setLoadingStep('expansion');
      setExpansionJob(null);
      setExpandedKeywordResult(null);
      setSavedExpansionKeywords([]);
      setMatchingResult(null);

      const ensuredProjectId = await onEnsureProject();
      const created = await createKeywordExpansionJob({
        projectId: ensuredProjectId || undefined,
        seedKeywords: effectiveSeedList,
        competitorDomains: [],
        clientWebsites: [],
        locationName: formData.locationName,
        persistRawKeywords: false,
      });

      let currentJob = await getKeywordExpansionJob(created.job_id);
      setExpansionJob(currentJob);

      while (currentJob.status === 'queued' || currentJob.status === 'running') {
        await sleep(1500);
        currentJob = await getKeywordExpansionJob(created.job_id);
        setExpansionJob(currentJob);
      }

      if (currentJob.status !== 'completed') {
        throw new Error(currentJob.error || 'Keyword expansion failed');
      }

      const completedJob = await getKeywordExpansionResult(created.job_id);
      setExpansionJob(completedJob);
      const result = completedJob.result || null;
      setExpandedKeywordResult(result);
      setSavedExpansionKeywords(result?.keywords || []);
      if (result && onExpansionComplete) {
        await onExpansionComplete(result, ensuredProjectId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to expand keywords from sitemap seeds');
    } finally {
      setLoadingStep(null);
    }
  };

  const handleSaveExpansionFilter = () => {
    setSavedExpansionKeywords(filteredExpansionKeywords);
    onKeywordSetSaved?.(filteredExpansionKeywords);
  };

  const handleMatching = async () => {
    try {
      if (!sitemapResult || !effectiveExpandedKeywords.length) return;
      setError('');
      setLoadingStep('matching');
      const result = await matchKeywordsToSitemap(formData, sitemapResult.result.rows, effectiveExpandedKeywords);
      setMatchingResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to match keywords to sitemap');
    } finally {
      setLoadingStep(null);
    }
  };

  return (
    <div className="flex flex-col h-full animate-fadeIn overflow-auto">
      <div className="px-7 pb-7 space-y-6">
        {error ? (
          <div className="bg-[#fff5f5] border border-[#fecaca] text-[#dc2626] rounded-xl p-3 text-[13px]">
            {error}
          </div>
        ) : null}

        {activePanel === 'business' ? (
          <StepShell
            title="Business Context"
            description="Define the business once. This context is used to generate the topic universe and sitemap structure for the project."
          >
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
                <label className="text-[12px] font-semibold text-[#1d1d1f]">Business Description & Core Offerings</label>
                <TextArea
                  required
                  value={formData.businessDescription}
                  onChange={(e) => setFormData({ ...formData, businessDescription: e.target.value })}
                  className="!min-h-[120px]"
                />
              </div>

              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-[#1d1d1f]">SEO Objectives & Primary Conversion Action</label>
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
                  items={formData.focusProductLines || []}
                  onChange={(items) => setFormData({ ...formData, focusProductLines: items })}
                />
              </div>

              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-[#1d1d1f]">Priority Keywords</label>
                <DynamicList
                  placeholder="Add a keyword and press Enter"
                  items={formData.mustRankKeywords || []}
                  onChange={(items) => setFormData({ ...formData, mustRankKeywords: items })}
                />
              </div>

              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-[#1d1d1f]">Competitor Domains</label>
                <DynamicList
                  placeholder="Add a competitor domain and press Enter"
                  items={formData.competitorDomains || []}
                  onChange={(items) => setFormData({ ...formData, competitorDomains: items })}
                />
              </div>

              <div className="flex flex-col gap-1.5 max-w-[220px]">
                <label className="text-[12px] font-semibold text-[#1d1d1f]">Location Name</label>
                <Input
                  value={formData.locationName || 'Thailand'}
                  onChange={(e) => setFormData({ ...formData, locationName: e.target.value })}
                />
              </div>
            </div>

            <div className="max-w-[840px]">
              <ActionCard
                title="Generate Topic Universe"
                description="When the business context is ready, run the next step directly from here to create the topic universe."
                primaryLabel="Generate Topic Universe"
                onPrimary={handleTopicUniverse}
                disabled={!canRunTopicUniverse || loadingStep !== null}
                busy={loadingStep === 'topic'}
              />
            </div>
          </StepShell>
        ) : null}

        {activePanel === 'topic-universe' ? (
          <StepShell
            title="Generate Topic Universe"
            description="Build the strategic topic dimensions first. This step defines the search territory before any sitemap rows or seeds are created."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <StatusCard label="Business Context" value={canRunTopicUniverse ? 'Ready' : 'Incomplete'} />
              <StatusCard label="Topic Dimensions" value={topicUniverse?.result.row_count || 0} />
              <StatusCard label="Current Status" value={loadingStep === 'topic' ? 'Running' : hasTopicUniverse ? 'Generated' : 'Not started'} />
            </div>

            <ActionCard
              title="Generate Topic Universe"
              description="Use the current business context to create the strategic topic dimension table."
              primaryLabel="Generate Topic Universe"
              onPrimary={handleTopicUniverse}
              disabled={!canRunTopicUniverse || loadingStep !== null}
              busy={loadingStep === 'topic'}
            />

            {!canRunTopicUniverse ? (
              <EmptyState
                title="Business context is still incomplete"
                description="Fill in business name, business description, and SEO objectives first. The topic universe should not run until the core business context is clear."
              />
            ) : null}

            {canRunTopicUniverse && !hasTopicUniverse && loadingStep !== 'topic' ? (
              <EmptyState
                title="No topic universe generated yet"
                description="Run this step to create the dimension table that the sitemap will depend on."
              />
            ) : null}

            {topicUniverse ? (
              <div className="rounded-2xl border border-[#e8e8ed] bg-white overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e8ed] bg-[#fafafa]">
                  <div>
                    <div className="text-[15px] font-semibold text-[#1d1d1f]">Topic Universe</div>
                    <div className="text-[12px] text-[#6e6e73] mt-1">{topicUniverse.result.row_count} dimensions</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadTextFile('topic-universe.csv', topicUniverse.result.csv, 'text/csv;charset=utf-8;')}
                    className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] border-none cursor-pointer"
                  >
                    Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left border-collapse">
                    <thead className="bg-[#fafafa] border-b border-[#e8e8ed]">
                      <tr>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">#</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Dimension</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Intent</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">What It Covers</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Example Queries</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topicUniverse.result.rows.map((row) => (
                        <tr key={row.index} className="border-b border-[#f1f1f4] align-top">
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.index}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.dimension_name}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.primary_intent}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.what_it_covers}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.example_search_queries.join(' | ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </StepShell>
        ) : null}

        {activePanel === 'sitemap' ? (
          <StepShell
            title="Generate Sitemap"
            description="Turn the topic universe into the site structure. This step defines the planned pages before any seed generation or keyword matching."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <StatusCard label="Topic Universe" value={hasTopicUniverse ? topicUniverse?.result.row_count || 0 : 'Missing'} />
              <StatusCard label="Sitemap Rows" value={sitemapResult?.result.row_count || 0} />
              <StatusCard label="Current Status" value={loadingStep === 'sitemap' ? 'Running' : hasSitemap ? 'Generated' : 'Not started'} />
            </div>

            <ActionCard
              title="Generate Sitemap"
              description="Create the full page architecture from the current topic universe."
              primaryLabel="Generate Sitemap"
              onPrimary={handleSitemap}
              disabled={!canRunSitemap || loadingStep !== null}
              busy={loadingStep === 'sitemap'}
            />

            {!hasTopicUniverse ? (
              <EmptyState
                title="Topic universe is required first"
                description="Run Generate Topic Universe before trying to produce sitemap rows. The sitemap should be created from the dimension table, not directly from the business context."
              />
            ) : null}

            {hasTopicUniverse && !hasSitemap && loadingStep !== 'sitemap' ? (
              <EmptyState
                title="No sitemap generated yet"
                description="The topic universe is ready. Run this step to create the working sitemap rows for the project."
              />
            ) : null}

            {sitemapResult ? (
              <div className="rounded-2xl border border-[#e8e8ed] bg-white overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e8ed] bg-[#fafafa]">
                  <div>
                    <div className="text-[15px] font-semibold text-[#1d1d1f]">Sitemap</div>
                    <div className="text-[12px] text-[#6e6e73] mt-1">{sitemapResult.result.row_count} rows</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadTextFile('sitemap-rows.csv', sitemapResult.result.csv, 'text/csv;charset=utf-8;')}
                    className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] border-none cursor-pointer"
                  >
                    Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left border-collapse">
                    <thead className="bg-[#fafafa] border-b border-[#e8e8ed]">
                      <tr>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Section</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Sub-section</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Page Title</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Slug</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Dimension</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Type</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Keyword Group</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">L3 Suggested Keywords</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sitemapResult.result.rows.map((row) => (
                        <tr key={row.slug_and_path} className="border-b border-[#f1f1f4] align-top">
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.section}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.sub_section_or_category || '—'}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.page_title}</td>
                          <td className="px-4 py-3 text-[12px] text-[#0071e3] font-mono">{row.slug_and_path}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.dimension_name || '—'}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.page_type}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.keyword_group || '—'}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">
                            {Array.isArray(row.l3_suggested_keywords) && row.l3_suggested_keywords.length
                              ? row.l3_suggested_keywords.join(' | ')
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </StepShell>
        ) : null}

        {activePanel === 'seeds-from-sitemap' ? (
          <StepShell
            title="Generate Seeds from Sitemap"
            description="Create root seeds from the planned sitemap, then verify whether each sitemap row is covered or intentionally unseeded."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <StatusCard label="Sitemap Rows" value={sitemapResult?.result.row_count || 0} />
              <StatusCard label="Seeds" value={effectiveSeedList.length || seedPlan?.result.seed_count || 0} />
              <StatusCard label="Coverage Rows" value={seedPlan?.result.coverage_row_count || 0} />
            </div>

            <ActionCard
              title="Generate Seeds from Sitemap"
              description="Create root seeds only after the sitemap exists. This step checks coverage page by page."
              primaryLabel="Generate Seeds from Sitemap"
              onPrimary={handleSeeds}
              disabled={!canRunSeeds || loadingStep !== null}
              busy={loadingStep === 'seeds'}
              secondary={
                hasSeedPlan ? (
                  <button
                    type="button"
                    onClick={handleExpansion}
                    disabled={!canRunExpansion || loadingStep !== null}
                    className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-[#1d1d1f] bg-white border border-[#d2d2d7] cursor-pointer disabled:opacity-50"
                  >
                    Expand Keywords from Seeds
                  </button>
                ) : undefined
              }
            />

            {!hasSitemap ? (
              <EmptyState
                title="Sitemap is required first"
                description="Run Generate Sitemap before creating seeds. Seeds are derived from planned sitemap rows, not generated independently."
              />
            ) : null}

            {hasSitemap && !hasSeedPlan && loadingStep !== 'seeds' ? (
              <EmptyState
                title="No sitemap seed plan yet"
                description="The sitemap exists. Run this step to create the seed list and coverage report."
              />
            ) : null}

            {seedPlan ? (
              <div className="rounded-2xl border border-[#e8e8ed] bg-white overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e8ed] bg-[#fafafa]">
                  <div>
                    <div className="text-[15px] font-semibold text-[#1d1d1f]">Seeds from Sitemap</div>
                    <div className="text-[12px] text-[#6e6e73] mt-1">{effectiveSeedList.length || seedPlan.result.seed_count} seeds ready for expansion</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadTextFile('sitemap-seed-coverage.csv', seedPlan.result.csv, 'text/csv;charset=utf-8;')}
                    className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] border-none cursor-pointer"
                  >
                    Export CSV
                  </button>
                </div>
                <div className="p-5 border-b border-[#f1f1f4]">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <div className="text-[12px] font-semibold text-[#1d1d1f]">Seed List</div>
                      <div className="text-[12px] text-[#6e6e73] mt-1">
                        Edit one seed per line. This edited list will be used in keyword expansion.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditableSeedList(seedPlan.result.seeds.join('\n'))}
                      className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[13px] font-medium text-[#1d1d1f] bg-white border border-[#d2d2d7] cursor-pointer"
                    >
                      Reset to Generated Seeds
                    </button>
                  </div>
                  <TextArea
                    rows={Math.max(6, Math.min(14, effectiveSeedList.length || 6))}
                    value={editableSeedList}
                    onChange={(event) => setEditableSeedList(event.target.value)}
                    placeholder="Enter one seed per line"
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left border-collapse">
                    <thead className="bg-[#fafafa] border-b border-[#e8e8ed]">
                      <tr>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Slug</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Dimension</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Status</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Covering Seeds</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seedPlan.result.coverage.map((row) => (
                        <tr key={row.slug_and_path} className="border-b border-[#f1f1f4] align-top">
                          <td className="px-4 py-3 text-[12px] text-[#0071e3] font-mono">{row.slug_and_path}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.dimension_name || '—'}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.coverage_status}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.covering_seeds.join(' | ') || '—'}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.reason_if_unseeded || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </StepShell>
        ) : null}

        {activePanel === 'expand-from-seeds' ? (
          <StepShell
            title="Expand Keywords from Seeds"
            description="Run the sitemap-derived seeds through the keyword API to produce the flat keyword list that Step 4b will match back into sitemap rows."
          >
            <div className="grid gap-3 sm:grid-cols-4">
              <StatusCard label="Project" value={projectId ? 'Ready' : 'Not saved yet'} />
              <StatusCard label="Seed Count" value={effectiveSeedList.length || seedPlan?.result.seed_count || 0} />
              <StatusCard label="Expanded Keywords" value={expandedKeywordResult?.keywords.length || 0} />
              <StatusCard label="Current Status" value={loadingStep === 'expansion' ? 'Running' : expandedKeywordResult ? 'Completed' : 'Not started'} />
            </div>

            <ActionCard
              title="Expand Keywords from Sitemap Seeds"
              description="This is the API expansion phase between seed generation and keyword matching. It uses only the sitemap-derived root seeds as input."
              primaryLabel="Expand Keywords from Seeds"
              onPrimary={handleExpansion}
              disabled={!canRunExpansion || loadingStep !== null}
              busy={loadingStep === 'expansion'}
              secondary={
                hasExpandedKeywords ? (
                  <button
                    type="button"
                    onClick={() => onNavigateToPanel('matching')}
                    className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-[#1d1d1f] bg-white border border-[#d2d2d7] cursor-pointer"
                  >
                    Go to Match Keywords to Sitemap
                  </button>
                ) : undefined
              }
            />

            {!hasSeedPlan ? (
              <EmptyState
                title="Seed plan is required first"
                description="Run Generate Seeds from Sitemap before API expansion. This step depends on the sitemap-derived root seed list."
              />
            ) : null}

            {hasSeedPlan && !expansionJob && !hasExpandedKeywords && loadingStep !== 'expansion' ? (
              <EmptyState
                title="No keyword expansion run yet"
                description="The seed list is ready. Run this step to produce the flat keyword list with search volumes from the keyword API."
              />
            ) : null}

            {expansionJob ? (
              <div className="rounded-2xl border border-[#e8e8ed] bg-white p-5 space-y-3">
                <div className="text-[15px] font-semibold text-[#1d1d1f]">Expansion Job</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="text-[13px] text-[#1d1d1f]"><span className="font-medium">Job ID:</span> {expansionJob.job_id}</div>
                  <div className="text-[13px] text-[#1d1d1f]"><span className="font-medium">Status:</span> {expansionJob.status}</div>
                  <div className="text-[13px] text-[#1d1d1f]"><span className="font-medium">Phase:</span> {expansionJob.progress.phase}</div>
                  <div className="text-[13px] text-[#1d1d1f]"><span className="font-medium">API Calls:</span> {expansionJob.progress.total_api_calls}</div>
                </div>
                <div className="text-[12px] text-[#6e6e73]">{expansionJob.progress.message || 'Running keyword API expansion'}</div>
                {expansionJob.status === 'completed' ? (
                  <div>
                    <a
                      href={getKeywordExpansionCsvUrl(expansionJob.job_id)}
                      className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] no-underline"
                    >
                      Download Expanded Keywords CSV
                    </a>
                  </div>
                ) : null}
              </div>
            ) : null}

            {expandedKeywordResult ? (
              <div className="rounded-2xl border border-[#e8e8ed] bg-white overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e8ed] bg-[#fafafa]">
                  <div>
                    <div className="text-[15px] font-semibold text-[#1d1d1f]">Expanded Keywords</div>
                    <div className="text-[12px] text-[#6e6e73] mt-1">
                      {filteredExpansionKeywords.length} visible · {savedExpansionKeywords.length || expandedKeywordResult.keywords.length} saved for matching · {expandedKeywordResult.summary.total_api_calls} API calls
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 border-b border-[#e8e8ed] bg-white p-4 md:grid-cols-[minmax(220px,1fr)_180px_auto]">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#8e8e93]">Keyword Filter</label>
                    <Input
                      placeholder="Filter by keyword"
                      value={expansionKeywordQuery}
                      onChange={(event) => setExpansionKeywordQuery(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#8e8e93]">Min Volume</label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="Any"
                      value={expansionMinVolume}
                      onChange={(event) => setExpansionMinVolume(event.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleSaveExpansionFilter}
                      disabled={!filteredExpansionKeywords.length}
                      className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] border-none cursor-pointer disabled:opacity-50"
                    >
                      Save Filter for Matching
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[520px]">
                  <table className="min-w-full text-left border-collapse">
                    <thead className="bg-[#fafafa] border-b border-[#e8e8ed] sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Keyword</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Search Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExpansionKeywords.map((row) => (
                        <tr key={`${row.keyword}-${typeof row.search_volume === 'number' ? row.search_volume : '-'}`} className="border-b border-[#f1f1f4] align-top">
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.keyword}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{typeof row.search_volume === 'number' ? row.search_volume : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </StepShell>
        ) : null}

        {activePanel === 'matching' ? (
          <StepShell
            title="Match Keywords to Sitemap"
            description="Match the expanded keyword set against the sitemap rows. This step fills each page with matched demand and can add new rows when the data justifies it."
          >
            <div className="grid gap-3 sm:grid-cols-4">
              <StatusCard label="Expanded Keywords" value={effectiveExpandedKeywords.length} />
              <StatusCard label="Matched Rows" value={matchingResult?.result.row_count || 0} />
              <StatusCard label="New Rows Added" value={matchingResult?.result.new_rows_added || 0} />
              <StatusCard label="Unmatched Keywords" value={matchingResult?.result.unmatched_keyword_count || 0} />
            </div>

            <ActionCard
              title="Match Keywords to Sitemap"
              description="Use the currently loaded expanded keyword set to populate the sitemap rows with page-level keyword groups."
              primaryLabel="Match Keywords to Sitemap"
              onPrimary={handleMatching}
              disabled={!canRunMatching || loadingStep !== null}
              busy={loadingStep === 'matching'}
              secondary={
                <div className="text-[12px] text-[#6e6e73]">
                  Available keywords: <span className="font-mono text-[#1d1d1f]">{effectiveExpandedKeywords.length}</span>
                </div>
              }
            />

            {!hasSitemap ? (
              <EmptyState
                title="Sitemap is required first"
                description="Generate the sitemap before matching any keywords. Matching works against planned pages, not directly against the topic universe."
              />
            ) : null}

            {hasSitemap && effectiveExpandedKeywords.length === 0 ? (
              <EmptyState
                title="No expanded keywords loaded"
                description="This step needs the flat keyword list produced by the API expansion phase. Run Expand Keywords from Seeds first, then come back to match them against the sitemap."
              />
            ) : null}

            {canRunMatching && !hasMatchingResult && loadingStep !== 'matching' ? (
              <EmptyState
                title="No matching result yet"
                description="The sitemap and expanded keywords are ready. Run this step to assign keywords to sitemap rows."
              />
            ) : null}

            {matchingResult ? (
              <div className="rounded-2xl border border-[#e8e8ed] bg-white overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e8ed] bg-[#fafafa]">
                  <div>
                    <div className="text-[15px] font-semibold text-[#1d1d1f]">Keyword-to-Sitemap Matching</div>
                    <div className="text-[12px] text-[#6e6e73] mt-1">
                      {matchingResult.result.row_count} rows · {matchingResult.result.new_rows_added} new rows · {matchingResult.result.unmatched_keyword_count} unmatched keywords
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadTextFile('matched-sitemap.csv', matchingResult.result.csv, 'text/csv;charset=utf-8;')}
                    className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] border-none cursor-pointer"
                  >
                    Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left border-collapse">
                    <thead className="bg-[#fafafa] border-b border-[#e8e8ed]">
                      <tr>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Section</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Sub-section</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Page Title</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Slug</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Dimension</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Page Type</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Keyword Group</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">L3 Keywords Top 5</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Matched Keywords</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Matching Note</th>
                        <th className="px-4 py-3 text-[12px] font-semibold text-[#1d1d1f]">Origin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchingResult.result.rows.map((row) => (
                        <tr key={`${row.slug_and_path}-${row.row_origin}`} className="border-b border-[#f1f1f4] align-top">
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.section}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.sub_section_or_category || '—'}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.page_title}</td>
                          <td className="px-4 py-3 text-[12px] text-[#0071e3] font-mono">{row.slug_and_path}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.dimension_name || '—'}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.page_type}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.keyword_group}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">
                            {row.l3_keywords_top_5.map((item) => `${item.keyword}, ${typeof item.search_volume === 'number' ? item.search_volume : '-'}`).join(' | ') || '—'}
                          </td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">
                            {row.matched_keywords.map((item) => `${item.keyword}, ${typeof item.search_volume === 'number' ? item.search_volume : '-'}`).join(' | ') || '—'}
                          </td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.matching_note || '—'}</td>
                          <td className="px-4 py-3 text-[12px] text-[#1d1d1f]">{row.row_origin}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-[#e8e8ed] bg-[#fafafa] px-5 py-4">
                  <div className="text-[13px] font-semibold text-[#1d1d1f]">Unmatched Keywords</div>
                  <div className="text-[12px] text-[#6e6e73] mt-1">
                    Keywords that still do not fit any sitemap row after matching.
                  </div>
                  <div className="text-[12px] text-[#1d1d1f] mt-3 leading-6">
                    {matchingResult.result.unmatched_keywords.length
                      ? matchingResult.result.unmatched_keywords
                          .map((item) => `${item.keyword}, ${typeof item.search_volume === 'number' ? item.search_volume : '-'}`)
                          .join(' | ')
                      : '—'}
                  </div>
                </div>
              </div>
            ) : null}
          </StepShell>
        ) : null}
      </div>
    </div>
  );
}
