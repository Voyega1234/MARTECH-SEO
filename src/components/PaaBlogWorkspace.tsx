import { useEffect, useMemo, useState } from 'react';
import type {
  KeywordExpansionResult,
  KeywordGroupingFinalResponse,
  PaaBlogJobDetail,
} from '../features/keyword-expansion/types';

interface PaaBlogWorkspaceProps {
  projectId: string | null;
  formData: Record<string, any>;
  expandedResult: KeywordExpansionResult | null;
  groupingResult: KeywordGroupingFinalResponse | null;
  groupingLoading: boolean;
  paaJob: PaaBlogJobDetail | null;
  paaError: string;
  paaRunning: boolean;
  onRun: () => void;
  onExportCsv: () => void;
}

function buildProjectSummary(formData: Record<string, any>) {
  return [
    { label: 'Business Name', value: formData.businessName || '-' },
    { label: 'Website URL', value: formData.websiteUrl || '-' },
    { label: 'Focus Product Lines', value: (formData.focusProductLines || []).join(', ') || '-' },
    { label: 'Priority Keywords', value: (formData.mustRankKeywords || []).join(', ') || '-' },
  ];
}

export function PaaBlogWorkspace({
  projectId,
  formData,
  expandedResult,
  groupingResult,
  groupingLoading,
  paaJob,
  paaError,
  paaRunning,
  onRun,
  onExportCsv,
}: PaaBlogWorkspaceProps) {
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const projectSummary = buildProjectSummary(formData);
  const relevantKeywords = expandedResult?.keywords.length || 0;
  const groupingStats = groupingResult?.result;
  const canRun = !!projectId && !!groupingStats && !groupingLoading && !paaRunning;
  const ideaRows = paaJob?.result?.ideas || [];
  const collectedEntries = paaJob?.result?.collected_entries || [];
  const isProcessing = paaRunning || paaJob?.status === 'queued' || paaJob?.status === 'running';
  const totalPages = Math.max(Math.ceil(ideaRows.length / pageSize), 1);
  const pagedIdeaRows = useMemo(
    () => ideaRows.slice((page - 1) * pageSize, page * pageSize),
    [ideaRows, page]
  );

  useEffect(() => {
    setPage(1);
  }, [ideaRows.length]);

  return (
    <div className="flex flex-col h-full animate-fadeIn">
      <div className="flex-1 overflow-y-auto px-7 py-5">
        <div className="w-full space-y-5">
          {!projectId ? (
            <div className="rounded-2xl border border-dashed border-[#d2d2d7] bg-[#fcfcfd] p-6">
              <div className="text-[15px] font-semibold text-[#1d1d1f]">Select a project first</div>
              <div className="text-[13px] text-[#6e6e73] mt-2 max-w-[760px] leading-6">
                Open <span className="font-medium text-[#1d1d1f]">My Projects</span> in the top right, load the
                project you want to use, then run PAA Blog from this page.
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-3xl border border-[#e8e8ed] bg-white p-6">
                <div className="flex items-start justify-between gap-5 flex-wrap">
                  <div className="max-w-[720px]">
                    <div className="text-[24px] font-semibold text-[#1d1d1f] tracking-[-0.6px]">PAA Blog Ideation</div>
                    <div className="text-[13px] text-[#6e6e73] mt-1 leading-6">
                      Generate Thai blog ideas from Google PAA and Related Searches using this project's saved business context and latest keyword map.
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={onExportCsv}
                      disabled={!ideaRows.length}
                      className={`rounded-xl px-4 py-2.5 text-[13px] font-semibold border transition-colors ${
                        ideaRows.length
                          ? 'bg-white text-[#1d1d1f] border-[#d2d2d7] cursor-pointer hover:bg-[#f5f5f7]'
                          : 'bg-[#f5f5f7] text-[#8e8e93] border-[#e8e8ed] cursor-not-allowed'
                      }`}
                    >
                      Export CSV
                    </button>
                    <button
                      type="button"
                      onClick={onRun}
                      disabled={!canRun}
                      className={`rounded-xl px-4 py-2.5 text-[13px] font-semibold border-none transition-colors ${
                        canRun
                          ? 'bg-[#0071e3] text-white cursor-pointer'
                          : 'bg-[#e8e8ed] text-[#8e8e93] cursor-not-allowed'
                      }`}
                    >
                      {paaRunning ? 'Running PAA Blog...' : 'Run PAA Blog'}
                    </button>
                  </div>
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)] mt-6">
                  <div>
                    <div className="text-[12px] font-semibold text-[#1d1d1f] mb-4">Project Context</div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {projectSummary.map((item) => (
                        <div key={item.label}>
                          <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">{item.label}</div>
                          <div className="mt-1 rounded-xl border border-[#eef0f3] bg-[#fafafa] px-4 py-3 text-[13px] text-[#1d1d1f] leading-6 break-words">
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[12px] font-semibold text-[#1d1d1f] mb-4">Snapshot</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-[#eef0f3] bg-[#fafafa] px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Relevant Keywords</div>
                        <div className="text-[13px] font-semibold text-[#1d1d1f] mt-1">{relevantKeywords}</div>
                      </div>
                      <div className="rounded-xl border border-[#eef0f3] bg-[#fafafa] px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Keyword Map Groups</div>
                        <div className="text-[13px] font-semibold text-[#1d1d1f] mt-1">{groupingStats?.group_count || 0}</div>
                      </div>
                      <div className="rounded-xl border border-[#eef0f3] bg-[#fafafa] px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Keyword Map Coverage</div>
                        <div className="text-[13px] font-semibold text-[#1d1d1f] mt-1">{groupingStats?.covered_keyword_count || 0}</div>
                      </div>
                      <div className="rounded-xl border border-[#eef0f3] bg-[#fafafa] px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Keyword Map Status</div>
                        <div className="text-[13px] font-semibold text-[#1d1d1f] mt-1">
                          {groupingLoading ? 'Loading...' : groupingStats ? 'Ready' : 'Missing'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {paaError ? (
                <div className="rounded-2xl border border-[#fecaca] bg-[#fff5f5] px-4 py-3 text-[13px] text-[#b42318]">
                  {paaError}
                </div>
              ) : null}

              {(groupingLoading || isProcessing) && (
                <div className="flex items-center justify-center py-8">
                  <div className="w-full max-w-[440px] text-center">
                    <span className="text-[56px] mb-5 block" style={{ animation: 'float 3s ease-in-out infinite' }}>
                      ✍️
                    </span>
                    <div className="text-[18px] font-medium text-[#1d1d1f] mb-1.5">
                      {groupingLoading ? 'Loading keyword map...' : 'Building PAA blog ideas...'}
                    </div>
                    <div className="text-[13px] text-[#6e6e73] mb-6 leading-relaxed">
                      Preparing Thai blog ideas for <strong className="text-[#1d1d1f]">{formData.businessName || 'your project'}</strong>
                    </div>
                    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border bg-[#f0f5ff] border-[rgba(0,122,255,0.3)] text-left">
                      <div className="text-[18px] w-7 text-center shrink-0 leading-none">🔎</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[#0071e3]">
                          {groupingLoading ? 'Preparing keyword map' : 'Collecting and cleaning SERP ideas'}
                        </div>
                        <div className="text-[11px] mt-0.5 text-[#007aff]">
                          {groupingLoading
                            ? 'Loading the latest grouping output for this project'
                            : paaJob?.progress.message || 'Processing PAA and Related Searches'}
                          <span className="animate-pulse">...</span>
                        </div>
                      </div>
                    </div>
                    {paaJob ? (
                      <div className="mt-3 text-[12px] text-[#6e6e73]">
                        {paaJob.progress.completed_serp_calls}/{paaJob.progress.total_serp_calls} SERP calls
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {paaJob?.status === 'completed' && paaJob.result ? (
                <div className="rounded-2xl border border-[#e8e8ed] bg-white p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                    <div>
                      <div className="text-[16px] font-semibold text-[#1d1d1f]">Final Blog Ideas</div>
                      <div className="text-[12px] text-[#6e6e73] mt-1">
                        {ideaRows.length} final Thai blog rows after cleanup and keyword-map filtering.
                      </div>
                    </div>
                    <div className="text-[12px] text-[#6e6e73]">
                      {collectedEntries.length} collected raw entries from DFS PAA and Related Searches
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                    <div className="text-[12px] text-[#6e6e73]">
                      Showing {ideaRows.length ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, ideaRows.length)} of {ideaRows.length}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPage((current) => Math.max(current - 1, 1))}
                        disabled={page <= 1}
                        className={`rounded-lg px-3 py-2 text-[12px] font-medium border ${
                          page > 1
                            ? 'border-[#d2d2d7] bg-white text-[#1d1d1f] cursor-pointer hover:bg-[#f5f5f7]'
                            : 'border-[#e8e8ed] bg-[#f5f5f7] text-[#8e8e93] cursor-not-allowed'
                        }`}
                      >
                        Previous
                      </button>
                      <div className="text-[12px] text-[#6e6e73]">
                        Page {page} / {totalPages}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
                        disabled={page >= totalPages}
                        className={`rounded-lg px-3 py-2 text-[12px] font-medium border ${
                          page < totalPages
                            ? 'border-[#d2d2d7] bg-white text-[#1d1d1f] cursor-pointer hover:bg-[#f5f5f7]'
                            : 'border-[#e8e8ed] bg-[#f5f5f7] text-[#8e8e93] cursor-not-allowed'
                        }`}
                      >
                        Next
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-[#eef0f3]">
                    <table className="min-w-full border-collapse text-left">
                      <thead className="bg-[#fafafa]">
                        <tr>
                          <th className="px-4 py-3 text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Blog Title</th>
                          <th className="px-4 py-3 text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Source</th>
                          <th className="px-4 py-3 text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Source Seed</th>
                          <th className="px-4 py-3 text-[11px] uppercase tracking-[0.6px] text-[#8e8e93]">Programmatic Variables</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedIdeaRows.map((row, index) => (
                          <tr key={`${row.blog_title}-${index}`} className="border-t border-[#eef0f3] align-top">
                            <td className="px-4 py-3 text-[13px] text-[#1d1d1f] leading-6 min-w-[360px]">{row.blog_title}</td>
                            <td className="px-4 py-3 text-[13px] text-[#1d1d1f] whitespace-nowrap">{row.source}</td>
                            <td className="px-4 py-3 text-[13px] text-[#1d1d1f] min-w-[220px]">{row.source_seed}</td>
                            <td className="px-4 py-3 text-[13px] text-[#6e6e73] min-w-[220px]">
                              {row.programmatic_variables || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
