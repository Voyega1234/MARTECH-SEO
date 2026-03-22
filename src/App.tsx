import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DynamicList } from './components/DynamicList';
import { Input } from './components/Input';
import { TextArea } from './components/TextArea';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { KeywordTable } from './components/KeywordTable';
import { SitemapTable } from './components/SitemapTable';
import { generateKeywords, generateSitemap } from './services/api';
import {
  createProject,
  saveKeywordResult,
  saveSitemapResult,
  listProjects,
  loadProject,
  deleteProject,
  type SeoProject,
} from './services/projects';

const initialFormData: Record<string, any> = {
  businessName: '',
  websiteUrl: '',
  businessDescription: '',
  seoGoals: '',
  mustRankKeywords: [],
  focusProductLines: [],
};

const mockFormData: Record<string, any> = {
  businessName: 'SolarTH',
  websiteUrl: 'https://solarth.co.th',
  businessDescription:
    'SolarTH is an online platform that aggregates solar installation companies in Thailand. It allows consumers (homeowners, businesses, factories) to search, compare prices, and find qualified installers for their solar system needs.',
  seoGoals:
    'SEO Goal: Generate traffic from people researching solar energy and capture qualified leads from consumers looking to install solar systems.\nConversion Action: User submission of the lead form requesting quotes or consultation.',
  mustRankKeywords: ['Solar cell installation', 'Solar EV charger', 'Solar rooftop'],
  focusProductLines: ['Solar Cell'],
};

type ActivePanel = 'business' | 'keywords' | 'sitemap';
type GeneratingState = null | 'keywords' | 'sitemap';

export default function App() {
  const [formData, setFormData] = useState<Record<string, any>>({ ...initialFormData });
  const [activePanel, setActivePanel] = useState<ActivePanel>('business');
  const [generating, setGenerating] = useState<GeneratingState>(null);
  const [streamText, setStreamText] = useState('');
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [keywordResult, setKeywordResult] = useState('');
  const [sitemapResult, setSitemapResult] = useState('');
  const [error, setError] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<SeoProject[]>([]);
  const [showProjectList, setShowProjectList] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Elapsed timer
  useEffect(() => {
    if (generating) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [generating]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamText]);

  // Load project list on mount
  useEffect(() => {
    listProjects().then(setProjects).catch(console.error);
  }, []);

  const hasKeywords = keywordResult.length > 0;
  const hasSitemap = sitemapResult.length > 0;

  // Count keyword groups for badge
  const keywordGroupCount = useMemo(() => {
    if (!keywordResult) return 0;
    try {
      const data = JSON.parse(keywordResult);
      let count = 0;
      for (const pl of data.product_lines || []) {
        for (const tp of pl.topic_pillars || []) {
          count += (tp.keyword_groups || []).length;
        }
      }
      return count;
    } catch {
      return 0;
    }
  }, [keywordResult]);

  const sidebarSteps = useMemo(
    () => [
      {
        id: 'business',
        label: 'Business Context',
        state: (hasKeywords ? 'complete' : activePanel === 'business' ? 'active' : 'pending') as
          | 'pending'
          | 'active'
          | 'complete',
      },
      {
        id: 'keywords',
        label: 'Keyword Groups',
        badge: keywordGroupCount,
        state: (hasSitemap
          ? 'complete'
          : hasKeywords && activePanel === 'keywords'
          ? 'active'
          : hasKeywords
          ? 'complete'
          : 'pending') as 'pending' | 'active' | 'complete',
      },
      {
        id: 'sitemap',
        label: 'Keyword Sitemap',
        state: (hasSitemap && activePanel === 'sitemap'
          ? 'active'
          : hasSitemap
          ? 'complete'
          : 'pending') as 'pending' | 'active' | 'complete',
      },
    ],
    [activePanel, hasKeywords, hasSitemap, keywordGroupCount]
  );

  const handleStepClick = (stepId: string) => {
    if (generating) return;
    if (stepId === 'keywords' && !hasKeywords) return;
    if (stepId === 'sitemap' && !hasSitemap) return;
    setActivePanel(stepId as ActivePanel);
  };

  const handleGenerateKeywords = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating('keywords');
    setStreamText('');
    setActiveTools([]);
    setError('');

    try {
      // Create project in Supabase if not already saved
      let currentProjectId = projectId;
      if (!currentProjectId) {
        try {
          const project = await createProject(formData);
          currentProjectId = project.id;
          setProjectId(project.id);
        } catch (err) {
          console.error('Failed to save project:', err);
        }
      }

      const result = await generateKeywords(formData);
      setKeywordResult(result.result);
      setGenerating(null);
      setActivePanel('keywords');

      // Save keywords to Supabase
      if (currentProjectId) {
        try {
          await saveKeywordResult(currentProjectId, result.result);
          setProjects(await listProjects());
        } catch (err) {
          console.error('Failed to save keywords:', err);
        }
      }
    } catch (err) {
      setError((err as Error).message);
      setGenerating(null);
    }
  };

  const handleGenerateSitemap = async () => {
    setGenerating('sitemap');
    setStreamText('');
    setActiveTools([]);
    setError('');

    const businessContext = `${formData.businessName} — ${formData.businessDescription}`;

    try {
      const result = await generateSitemap(keywordResult, businessContext);
      setSitemapResult(result.result);
      setGenerating(null);
      setActivePanel('sitemap');

      // Save sitemap to Supabase
      if (projectId) {
        try {
          await saveSitemapResult(projectId, result.result);
          setProjects(await listProjects());
        } catch (err) {
          console.error('Failed to save sitemap:', err);
        }
      }
    } catch (err) {
      setError((err as Error).message);
      setGenerating(null);
    }
  };

  const handleStartOver = () => {
    setFormData({ ...initialFormData });
    setActivePanel('business');
    setGenerating(null);
    setStreamText('');
    setActiveTools([]);
    setKeywordResult('');
    setSitemapResult('');
    setError('');
    setProjectId(null);
    setShowProjectList(false);
  };

  const handleLoadProject = async (project: SeoProject) => {
    setFormData({
      businessName: project.business_name,
      websiteUrl: project.website_url || '',
      businessDescription: project.business_description,
      seoGoals: project.seo_goals,
      focusProductLines: project.focus_product_lines || [],
      mustRankKeywords: project.must_rank_keywords || [],
    });
    setProjectId(project.id);
    setKeywordResult(project.keyword_result ? JSON.stringify(project.keyword_result) : '');
    setSitemapResult(project.sitemap_result ? JSON.stringify(project.sitemap_result) : '');
    setError('');
    setShowProjectList(false);

    if (project.sitemap_result) {
      setActivePanel('sitemap');
    } else if (project.keyword_result) {
      setActivePanel('keywords');
    } else {
      setActivePanel('business');
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (projectId === id) handleStartOver();
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  const projectName = formData.businessName || undefined;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f5f5f7]">
      <Header
        projectName={projectName}
        onOpenProjects={() => {
          listProjects().then(setProjects).catch(console.error);
          setShowProjectList(true);
        }}
        onNewProject={hasKeywords ? handleStartOver : undefined}
        onExportCsv={hasKeywords ? () => {} : undefined}
        showActions={hasKeywords}
      />

      {/* Project List Modal */}
      {showProjectList && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col animate-fadeIn">
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-[#e8e8ed]">
              <h2 className="text-[18px] font-semibold text-[#1d1d1f]">Projects</h2>
              <button
                onClick={() => setShowProjectList(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#6e6e73] hover:bg-[#f5f5f7] transition-colors cursor-pointer border-none bg-transparent"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-3">
              {/* New Project button */}
              <button
                onClick={handleStartOver}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-[#d2d2d7] text-[#6e6e73] hover:border-[#0071e3] hover:text-[#0071e3] transition-all cursor-pointer bg-transparent mb-3"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                  <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z" />
                </svg>
                <span className="text-[13px] font-medium">New Project</span>
              </button>

              {/* Project list */}
              {projects.length === 0 && (
                <div className="text-center py-8 text-[13px] text-[#aeaeb2]">
                  No saved projects yet
                </div>
              )}

              {projects.map((project) => {
                const statusColor =
                  project.status === 'sitemap_generated'
                    ? 'bg-[#34c759]'
                    : project.status === 'keywords_generated'
                    ? 'bg-[#0071e3]'
                    : 'bg-[#aeaeb2]';
                const statusLabel =
                  project.status === 'sitemap_generated'
                    ? 'Complete'
                    : project.status === 'keywords_generated'
                    ? 'Keywords Done'
                    : 'Draft';
                const isActive = project.id === projectId;

                return (
                  <div
                    key={project.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-1.5 cursor-pointer transition-all ${
                      isActive
                        ? 'bg-[#e8f1fb] border border-[#0071e3]/30'
                        : 'hover:bg-[#f5f5f7] border border-transparent'
                    }`}
                    onClick={() => handleLoadProject(project)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium text-[#1d1d1f] truncate">
                        {project.business_name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
                        <span className="text-[11px] text-[#6e6e73]">{statusLabel}</span>
                        {project.keyword_group_count > 0 && (
                          <>
                            <span className="text-[#d2d2d7]">·</span>
                            <span className="text-[11px] text-[#aeaeb2] font-mono">
                              {project.keyword_group_count} groups
                            </span>
                          </>
                        )}
                        <span className="text-[#d2d2d7]">·</span>
                        <span className="text-[11px] text-[#aeaeb2]">
                          {new Date(project.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(project.id);
                      }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[#aeaeb2] hover:text-[#ff3b30] hover:bg-[#fff5f5] transition-colors cursor-pointer border-none bg-transparent shrink-0"
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25zM3.613 5.5l.806 8.87A1.75 1.75 0 0 0 6.163 16h3.674a1.75 1.75 0 0 0 1.744-1.63l.806-8.87H3.613z" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar steps={sidebarSteps} onStepClick={handleStepClick} />

        <main className="flex-1 overflow-hidden flex flex-col">
          {/* ── Generating Overlay ── */}
          {generating && (
            <div className="flex flex-col h-full animate-fadeIn">
              {/* Header area */}
              <div className="px-7 pt-6 pb-4 shrink-0">
                <div className="flex items-center gap-4 mb-4">
                  {/* Animated spinner */}
                  <div className="relative w-11 h-11 shrink-0">
                    <div className="absolute inset-0 rounded-full border-[3px] border-[#e8e8ed]" />
                    <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[#0071e3] animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg viewBox="0 0 16 16" fill="#0071e3" className="w-4 h-4">
                        <path d="M8.75 1.75a.75.75 0 0 0-1.5 0v5.69L5.03 5.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 7.44V1.75z" />
                        <path d="M1.75 12.5a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H1.75z" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <div className="text-[22px] font-semibold text-[#1d1d1f] tracking-[-0.5px]">
                      {generating === 'keywords' ? 'Generating Keyword Map' : 'Generating Sitemap'}
                    </div>
                    <div className="text-[13px] text-[#6e6e73] mt-0.5 flex items-center gap-2">
                      <span>AI is researching and building your SEO plan</span>
                      <span className="text-[#aeaeb2]">·</span>
                      <span className="font-mono text-[12px] text-[#aeaeb2] tabular-nums">
                        {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress steps */}
                <div className="flex items-center gap-6 py-3 px-4 bg-white rounded-xl border border-[#e8e8ed]">
                  {[
                    { label: 'Connecting', done: elapsed >= 2 },
                    { label: 'Researching', done: elapsed >= 15 },
                    { label: 'Analyzing', done: elapsed >= 60 },
                    { label: 'Finalizing', done: false },
                  ].map((step, i, arr) => {
                    const isActive = !step.done && (i === 0 || arr[i - 1].done);
                    return (
                      <div key={i} className="flex items-center gap-2">
                        {i > 0 && (
                          <div className={`w-8 h-px ${arr[i - 1].done ? 'bg-[#34c759]' : 'bg-[#e8e8ed]'}`} />
                        )}
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                          step.done
                            ? 'bg-[#34c759] text-white'
                            : isActive
                            ? 'bg-[#0071e3] text-white animate-pulse'
                            : 'bg-[#f5f5f7] text-[#d2d2d7] border border-[#e8e8ed]'
                        }`}>
                          {step.done ? (
                            <svg viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
                              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
                            </svg>
                          ) : (
                            i + 1
                          )}
                        </div>
                        <span className={`text-[12px] font-medium whitespace-nowrap ${
                          step.done ? 'text-[#34c759]' : isActive ? 'text-[#0071e3]' : 'text-[#d2d2d7]'
                        }`}>
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tool badges */}
              {activeTools.length > 0 && (
                <div className="flex flex-wrap gap-2 px-7 pb-2">
                  {activeTools.slice(-5).map((tool, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#e8f1fb] text-[#0071e3] rounded-full text-[11px] font-medium animate-fadeIn"
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                        <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5h-3.32zM8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
                      </svg>
                      {tool}
                    </span>
                  ))}
                </div>
              )}

              {/* Agent status */}
              <div className="flex-1 overflow-y-auto px-7 py-3">
                <div className="bg-[#1d1d1f] rounded-xl p-5 min-h-[200px] max-h-full overflow-y-auto">
                  <div className="flex items-center gap-2 mb-3">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-white/20">
                      <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25V1.75zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25H1.75zM3 3.75A.75.75 0 0 1 3.75 3h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 3 3.75zM3.75 6a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5zm0 3.5a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-5.5z"/>
                    </svg>
                    <span className="text-[11px] text-white/30 font-mono">execution logs</span>
                  </div>
                  <pre className="text-[12px] text-[#a1a1a6] whitespace-pre-wrap font-mono leading-relaxed">
                    {elapsed < 2 && (
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block w-1.5 h-3.5 bg-[#0071e3] animate-pulse rounded-sm" />
                        <span className="text-white/40">Connecting to agent...</span>
                      </span>
                    )}
                    {elapsed >= 2 && elapsed < 15 && '> Connected to AI agent\n> Starting keyword research with DataForSEO tools...\n'}
                    {elapsed >= 15 && elapsed < 60 && '> Connected to AI agent\n> Starting keyword research with DataForSEO tools...\n> Researching keywords and search volumes...\n> Analyzing search intent and competition...\n'}
                    {elapsed >= 60 && '> Connected to AI agent\n> Starting keyword research with DataForSEO tools...\n> Researching keywords and search volumes...\n> Analyzing search intent and competition...\n> Generating structured keyword map...\n> Building topic pillars and keyword groups...\n'}
                    <span className="inline-flex items-center gap-1 mt-1">
                      <span className="inline-block w-1.5 h-3.5 bg-[#0071e3] animate-pulse rounded-sm" />
                    </span>
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* ── Panel 1: Business Context ── */}
          {!generating && activePanel === 'business' && (
            <div className="flex flex-col h-full animate-fadeIn">
              <div className="px-7 pt-5 shrink-0">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="text-[22px] font-semibold text-[#1d1d1f] tracking-[-0.5px]">
                      Business Context
                    </div>
                    <div className="text-[13px] text-[#6e6e73] mt-1">
                      Provide details about your business so we can build a targeted keyword strategy.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...mockFormData })}
                    className="shrink-0 px-3 py-1.5 text-[12px] font-medium text-[#0071e3] bg-[#e8f1fb] rounded-lg hover:bg-[#d4e5f7] transition-colors cursor-pointer border-none"
                  >
                    Fill Demo
                  </button>
                </div>
                <div className="flex gap-0 border-b border-[#e8e8ed]">
                  <button className="px-4 py-2.5 text-[13px] font-medium text-[#0071e3] border-b-2 border-[#0071e3] -mb-px bg-transparent border-t-0 border-l-0 border-r-0 cursor-pointer">
                    Overview
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-7 py-6">
                {/* Error Banner */}
                {error && (
                  <div className="bg-[#fff5f5] border border-[#fecaca] text-[#dc2626] rounded-xl p-3 text-[13px] mb-4">
                    {error}
                  </div>
                )}

                {/* Generate CTA */}
                {hasKeywords && (
                  <div className="bg-gradient-to-br from-[#1d1d1f] to-[#2d2d30] rounded-[14px] p-5 flex items-center gap-4 max-w-[840px] mb-5">
                    <div className="w-10 h-10 rounded-[10px] bg-white/10 flex items-center justify-center shrink-0 text-white">
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
                        <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm3.28 5.22a.75.75 0 0 0-1.06 0L7 8.44 5.78 7.22a.75.75 0 0 0-1.06 1.06l1.75 1.75a.75.75 0 0 0 1.06 0l3.75-3.75a.75.75 0 0 0 0-1.06z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-[14px] font-semibold text-white mb-0.5">Keywords Generated</h4>
                      <p className="text-[12px] text-white/55">
                        Your keyword map is ready. View it or update your business context.
                      </p>
                    </div>
                    <button
                      onClick={() => setActivePanel('keywords')}
                      className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-lg text-[13px] font-medium bg-white text-[#1d1d1f] border-none cursor-pointer hover:bg-[#e8e8ed] transition-colors whitespace-nowrap"
                    >
                      View Keywords
                    </button>
                  </div>
                )}

                <form onSubmit={handleGenerateKeywords}>
                  <div className="grid grid-cols-2 gap-4 max-w-[840px]">
                    {/* Company Details */}
                    <div className="col-span-2 text-[11px] font-semibold text-[#aeaeb2] tracking-[0.8px] uppercase pt-1">
                      Company Details
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#1d1d1f] flex items-center gap-1">
                        Business Name <span className="text-[#0071e3] text-[13px]">*</span>
                      </label>
                      <Input
                        placeholder="e.g. SolarTH"
                        value={formData.businessName}
                        onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                        required
                        className="!bg-[#f5f5f7] !border-[#d2d2d7] !rounded-[10px] !px-3.5 !py-2.5 !text-[13.5px] focus:!border-[#0071e3] focus:!bg-white focus:!shadow-[0_0_0_3px_rgba(0,113,227,0.12)]"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#1d1d1f]">Website URL</label>
                      <Input
                        type="text"
                        placeholder="convertcake.com"
                        value={formData.websiteUrl}
                        onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                        className="!bg-[#f5f5f7] !border-[#d2d2d7] !rounded-[10px] !px-3.5 !py-2.5 !text-[13.5px] focus:!border-[#0071e3] focus:!bg-white focus:!shadow-[0_0_0_3px_rgba(0,113,227,0.12)]"
                      />
                    </div>

                    <div className="col-span-2 flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#1d1d1f] flex items-center gap-1">
                        Business Description & Core Offerings{' '}
                        <span className="text-[#0071e3] text-[13px]">*</span>
                      </label>
                      <p className="text-[12px] text-[#6e6e73] leading-relaxed">
                        Describe your primary products or services and the value you deliver to customers.
                      </p>
                      <TextArea
                        placeholder="Example: SolarTH is an online platform that aggregates solar installation companies in Thailand..."
                        value={formData.businessDescription}
                        onChange={(e) => setFormData({ ...formData, businessDescription: e.target.value })}
                        required
                        className="!bg-[#f5f5f7] !border-[#d2d2d7] !rounded-[10px] !px-3.5 !py-2.5 !text-[13.5px] !min-h-[120px] focus:!border-[#0071e3] focus:!bg-white focus:!shadow-[0_0_0_3px_rgba(0,113,227,0.12)]"
                      />
                    </div>

                    {/* Divider */}
                    <div className="col-span-2 h-px bg-[#e8e8ed] my-1" />

                    {/* Campaign Focus */}
                    <div className="col-span-2 text-[11px] font-semibold text-[#aeaeb2] tracking-[0.8px] uppercase pt-1">
                      Campaign Focus
                    </div>

                    <div className="col-span-2 flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#1d1d1f] flex items-center gap-1">
                        Focus Product Lines{' '}
                        <span className="text-[#aeaeb2] font-normal text-[11px]">(Optional)</span>
                      </label>
                      <p className="text-[12px] text-[#6e6e73] leading-relaxed">
                        Narrow to 1-2 core product lines for maximum keyword depth.
                      </p>
                      <DynamicList
                        placeholder="Add a product line and press Enter"
                        items={formData.focusProductLines}
                        onChange={(items) => setFormData({ ...formData, focusProductLines: items })}
                      />
                    </div>

                    <div className="col-span-2 flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#1d1d1f] flex items-center gap-1">
                        SEO Objectives & Primary Conversion Action{' '}
                        <span className="text-[#0071e3] text-[13px]">*</span>
                      </label>
                      <p className="text-[12px] text-[#6e6e73] leading-relaxed">
                        Define your campaign goal and the specific action you want visitors to take.
                      </p>
                      <TextArea
                        placeholder="Example: SEO Goal: Generate traffic from people researching solar energy..."
                        value={formData.seoGoals}
                        onChange={(e) => setFormData({ ...formData, seoGoals: e.target.value })}
                        required
                        className="!bg-[#f5f5f7] !border-[#d2d2d7] !rounded-[10px] !px-3.5 !py-2.5 !text-[13.5px] !min-h-[90px] focus:!border-[#0071e3] focus:!bg-white focus:!shadow-[0_0_0_3px_rgba(0,113,227,0.12)]"
                      />
                    </div>

                    {/* Divider */}
                    <div className="col-span-2 h-px bg-[#e8e8ed] my-1" />

                    {/* Target Keywords */}
                    <div className="col-span-2 text-[11px] font-semibold text-[#aeaeb2] tracking-[0.8px] uppercase pt-1">
                      Target Keywords
                    </div>

                    <div className="col-span-2 flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#1d1d1f] flex items-center gap-1">
                        Priority Keywords{' '}
                        <span className="text-[#aeaeb2] font-normal text-[11px]">(Optional)</span>
                      </label>
                      <p className="text-[12px] text-[#6e6e73] leading-relaxed">
                        List any keywords your business must rank for. These will be treated as non-negotiable anchors.
                      </p>
                      <DynamicList
                        placeholder="Add a keyword and press Enter"
                        items={formData.mustRankKeywords}
                        onChange={(items) => setFormData({ ...formData, mustRankKeywords: items })}
                      />
                    </div>

                    {/* Submit */}
                    <div className="col-span-2 flex items-center gap-2.5 pt-2">
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 px-5 py-[9px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] border-none hover:bg-[#0077ed] active:scale-[0.98] transition-all cursor-pointer"
                      >
                        Save & Generate Keywords
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M12.78 6.22a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L3.22 7.28a.75.75 0 0 1 1.06-1.06L8 9.94l3.72-3.72a.75.75 0 0 1 1.06 0z" transform="rotate(-90 8 8)" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ── Panel 2: Keyword Groups ── */}
          {!generating && activePanel === 'keywords' && hasKeywords && (
            <div className="flex flex-col h-full animate-fadeIn">
              <div className="px-7 pt-5 shrink-0">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="text-[22px] font-semibold text-[#1d1d1f] tracking-[-0.5px]">
                      Keyword Groups
                    </div>
                    <div className="text-[13px] text-[#6e6e73] mt-1">
                      Topical authority map · {keywordGroupCount} groups
                    </div>
                  </div>
                  {!hasSitemap && (
                    <button
                      onClick={handleGenerateSitemap}
                      className="shrink-0 inline-flex items-center gap-1.5 px-4 py-[8px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] border-none hover:bg-[#0077ed] active:scale-[0.98] transition-all cursor-pointer"
                    >
                      Generate Sitemap
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M12.78 6.22a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L3.22 7.28a.75.75 0 0 1 1.06-1.06L8 9.94l3.72-3.72a.75.75 0 0 1 1.06 0z" transform="rotate(-90 8 8)" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-auto px-7 pb-7">
                <KeywordTable data={keywordResult} />
              </div>
            </div>
          )}

          {/* ── Panel 3: Keyword Sitemap ── */}
          {!generating && activePanel === 'sitemap' && hasSitemap && (
            <div className="flex flex-col h-full animate-fadeIn">
              <div className="px-7 pt-5 shrink-0">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="text-[22px] font-semibold text-[#1d1d1f] tracking-[-0.5px]">
                      Keyword Sitemap
                    </div>
                    <div className="text-[13px] text-[#6e6e73] mt-1">
                      URL structure and page hierarchy for your SEO plan.
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto px-7 pb-7">
                <SitemapTable data={sitemapResult} />
              </div>
            </div>
          )}

          {/* ── Empty state for locked panels ── */}
          {!generating && activePanel === 'keywords' && !hasKeywords && (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 py-16 text-center animate-fadeIn">
              <div className="w-12 h-12 rounded-[14px] bg-[#f5f5f7] border border-[#d2d2d7] flex items-center justify-center text-[#aeaeb2]">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
                  <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
                </svg>
              </div>
              <div className="text-[15px] font-semibold text-[#1d1d1f]">No keywords yet</div>
              <div className="text-[13px] text-[#6e6e73] max-w-[300px] leading-relaxed">
                Fill out the Business Context form first, then generate your keyword map.
              </div>
              <button
                onClick={() => setActivePanel('business')}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-[#0071e3] bg-[#e8f1fb] border-none cursor-pointer hover:bg-[#d4e5f7] transition-colors"
              >
                Go to Business Context
              </button>
            </div>
          )}

          {!generating && activePanel === 'sitemap' && !hasSitemap && (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 py-16 text-center animate-fadeIn">
              <div className="w-12 h-12 rounded-[14px] bg-[#f5f5f7] border border-[#d2d2d7] flex items-center justify-center text-[#aeaeb2]">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
                  <path d="M1.75 2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25H1.75zM0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75z" />
                </svg>
              </div>
              <div className="text-[15px] font-semibold text-[#1d1d1f]">No sitemap yet</div>
              <div className="text-[13px] text-[#6e6e73] max-w-[300px] leading-relaxed">
                Generate keywords first, then create your sitemap plan.
              </div>
              {hasKeywords && (
                <button
                  onClick={() => setActivePanel('keywords')}
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-[#0071e3] bg-[#e8f1fb] border-none cursor-pointer hover:bg-[#d4e5f7] transition-colors"
                >
                  Go to Keywords
                </button>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
