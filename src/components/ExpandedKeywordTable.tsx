import { memo, useDeferredValue, useEffect, useMemo, useState, useTransition } from 'react';
import type { KeywordExpansionKeywordRow } from '../features/keyword-expansion/types';

type SourceCatalog = {
  s: string[];
  c: string[];
  w: string[];
};

type SourceTypeFilter = 'seed' | 'competitor' | 'client_website';

const SOURCE_FILTER_LABELS: Record<SourceTypeFilter, string> = {
  seed: 'Seed',
  competitor: 'Competitor',
  client_website: 'Client Website',
};

const ALL_SOURCE_FILTERS: SourceTypeFilter[] = ['seed', 'competitor', 'client_website'];

function escapeCsv(val: string) {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function resolveSourceRefValue(ref: string, sourceCatalog?: SourceCatalog): string {
  if (!sourceCatalog) return ref;

  const prefix = ref.charAt(0);
  const rawIndex = ref.slice(1);
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0) return ref;

  if (prefix === 's') return sourceCatalog.s[index] || ref;
  if (prefix === 'c') return sourceCatalog.c[index] || ref;
  if (prefix === 'w') return sourceCatalog.w[index] || ref;
  return ref;
}

function sourceTypeFromRef(ref: string): SourceTypeFilter | null {
  const prefix = ref.charAt(0);
  if (prefix === 's') return 'seed';
  if (prefix === 'c') return 'competitor';
  if (prefix === 'w') return 'client_website';
  return null;
}

function getRowSourceTypes(row: KeywordExpansionKeywordRow): SourceTypeFilter[] {
  return Array.from(
    new Set(
      (row.source_refs || [])
        .map((source) => sourceTypeFromRef(source))
        .filter((source): source is SourceTypeFilter => Boolean(source))
    )
  );
}

function matchesSelectedSources(row: KeywordExpansionKeywordRow, selectedSources: SourceTypeFilter[]) {
  const rowSourceTypes = getRowSourceTypes(row);
  return rowSourceTypes.some((source) => selectedSources.includes(source));
}

const TableRow = memo(function TableRow({
  row,
  showCompetitorRank,
  showClientWebsiteRank,
}: {
  row: KeywordExpansionKeywordRow;
  showCompetitorRank: boolean;
  showClientWebsiteRank: boolean;
}) {
  return (
    <tr className="border-b border-[#e8e8ed] hover:bg-[#f8fbff]">
      <td className="py-2.5 px-3.5 text-[13px] text-[#1d1d1f] break-words align-top">
        {row.keyword}
      </td>
      <td className="py-2.5 px-3.5 text-[13px] text-[#1d1d1f] font-mono align-top whitespace-nowrap">
        {row.search_volume}
      </td>
      {showCompetitorRank ? (
        <td className="py-2.5 px-3.5 text-[13px] text-[#1d1d1f] font-mono align-top whitespace-nowrap">
          {typeof row.best_competitor_rank_group === 'number' ? row.best_competitor_rank_group : '-'}
        </td>
      ) : null}
      {showClientWebsiteRank ? (
        <td className="py-2.5 px-3.5 text-[13px] text-[#1d1d1f] font-mono align-top whitespace-nowrap">
          {typeof row.best_client_website_rank_group === 'number' ? row.best_client_website_rank_group : '-'}
        </td>
      ) : null}
    </tr>
  );
});

export function ExpandedKeywordTable({
  rows,
  projectName,
  sourceCatalog,
  onFilteredRowsChange,
  onSaveFilter,
  isCurrentFilterSaved = true,
  savedKeywordCount,
}: {
  rows: KeywordExpansionKeywordRow[];
  projectName?: string;
  sourceCatalog?: SourceCatalog;
  onFilteredRowsChange?: (rows: KeywordExpansionKeywordRow[]) => void;
  onSaveFilter?: (rows: KeywordExpansionKeywordRow[]) => void;
  isCurrentFilterSaved?: boolean;
  savedKeywordCount?: number;
}) {
  const [search, setSearch] = useState('');
  const [minSearchVolume, setMinSearchVolume] = useState('0');
  const [selectedSources, setSelectedSources] = useState<SourceTypeFilter[]>(ALL_SOURCE_FILTERS);
  const [competitorMaxRank, setCompetitorMaxRank] = useState('');
  const [clientWebsiteMaxRank, setClientWebsiteMaxRank] = useState('');
  const [showCompetitorRank, setShowCompetitorRank] = useState(false);
  const [showClientWebsiteRank, setShowClientWebsiteRank] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const deferredSearch = useDeferredValue(search);
  const deferredMinSearchVolume = useDeferredValue(minSearchVolume);
  const deferredSelectedSources = useDeferredValue(selectedSources);
  const canShowCompetitorRank = selectedSources.includes('competitor');
  const canShowClientWebsiteRank = selectedSources.includes('client_website');
  const deferredCompetitorMaxRank = useDeferredValue(competitorMaxRank);
  const deferredClientWebsiteMaxRank = useDeferredValue(clientWebsiteMaxRank);

  useEffect(() => {
    if (!canShowCompetitorRank && showCompetitorRank) {
      setShowCompetitorRank(false);
    }
  }, [canShowCompetitorRank, showCompetitorRank]);

  useEffect(() => {
    if (!canShowClientWebsiteRank && showClientWebsiteRank) {
      setShowClientWebsiteRank(false);
    }
  }, [canShowClientWebsiteRank, showClientWebsiteRank]);

  const filteredRows = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const minVolume = Number(deferredMinSearchVolume);
    const competitorMaxRankValue = Number(deferredCompetitorMaxRank);
    const clientWebsiteMaxRankValue = Number(deferredClientWebsiteMaxRank);
    const hasCompetitorRankFilter =
      deferredSelectedSources.includes('competitor') &&
      deferredCompetitorMaxRank.trim() !== '' &&
      Number.isFinite(competitorMaxRankValue);
    const hasClientWebsiteRankFilter =
      deferredSelectedSources.includes('client_website') &&
      deferredClientWebsiteMaxRank.trim() !== '' &&
      Number.isFinite(clientWebsiteMaxRankValue);

    return rows.filter((row) => {
      const searchMatch =
        !query ||
        row.keyword.toLowerCase().includes(query) ||
        (row.source_refs || []).some((source) =>
          resolveSourceRefValue(source, sourceCatalog).toLowerCase().includes(query)
        );

      if (!searchMatch) return false;

      const volume = typeof row.search_volume === 'number' ? row.search_volume : 0;
      if (deferredMinSearchVolume.trim() && volume < minVolume) {
        return false;
      }

      if (!matchesSelectedSources(row, deferredSelectedSources)) {
        return false;
      }

      const rowSourceTypes = getRowSourceTypes(row);
      let matches = false;

      if (deferredSelectedSources.includes('seed') && rowSourceTypes.includes('seed')) {
        matches = true;
      }

      if (deferredSelectedSources.includes('competitor') && rowSourceTypes.includes('competitor')) {
        const competitorPass =
          !hasCompetitorRankFilter ||
          (typeof row.best_competitor_rank_group === 'number' &&
            row.best_competitor_rank_group <= competitorMaxRankValue);
        if (competitorPass) {
          matches = true;
        }
      }

      if (deferredSelectedSources.includes('client_website') && rowSourceTypes.includes('client_website')) {
        const clientWebsitePass =
          !hasClientWebsiteRankFilter ||
          (typeof row.best_client_website_rank_group === 'number' &&
            row.best_client_website_rank_group <= clientWebsiteMaxRankValue);
        if (clientWebsitePass) {
          matches = true;
        }
      }

      return matches;
    });
  }, [
    rows,
    deferredSearch,
    deferredMinSearchVolume,
    deferredSelectedSources,
    deferredCompetitorMaxRank,
    deferredClientWebsiteMaxRank,
    sourceCatalog,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    deferredSearch,
    deferredMinSearchVolume,
    deferredSelectedSources,
    deferredCompetitorMaxRank,
    deferredClientWebsiteMaxRank,
    rowsPerPage,
  ]);

  useEffect(() => {
    onFilteredRowsChange?.(filteredRows);
  }, [filteredRows, onFilteredRowsChange]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [currentPage, filteredRows, rowsPerPage]);

  const visibleStart = filteredRows.length ? (currentPage - 1) * rowsPerPage + 1 : 0;
  const visibleEnd = filteredRows.length ? Math.min(currentPage * rowsPerPage, filteredRows.length) : 0;

  const resetFilters = () => {
    startTransition(() => {
      setSearch('');
      setMinSearchVolume('0');
      setSelectedSources(ALL_SOURCE_FILTERS);
      setCompetitorMaxRank('');
      setClientWebsiteMaxRank('');
    });
  };

  const toggleSource = (source: SourceTypeFilter) => {
    startTransition(() => {
      setSelectedSources((current) => {
        if (current.includes(source)) {
          const next = current.filter((item) => item !== source);
          return next.length ? next : [source];
        }
        return [...current, source];
      });
    });
  };

  const exportCsv = () => {
    const headers = ['Keyword', 'Search Volume'];
    const csvRows = filteredRows.map((row) => [escapeCsv(row.keyword), String(row.search_volume)].join(','));
    const slug = (projectName || 'expanded-keywords').replace(/\s+/g, '-').toLowerCase();
    downloadCsv(`${slug}-expanded-keywords.csv`, [headers.join(','), ...csvRows].join('\n'));
  };

  const handleSaveFilter = () => {
    onSaveFilter?.(filteredRows);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-3 pb-4 shrink-0">
        <input
          type="text"
          placeholder="Search keywords or sources"
          value={search}
          onChange={(e) => {
            const nextValue = e.target.value;
            startTransition(() => {
              setSearch(nextValue);
            });
          }}
          className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg py-[7px] px-3 text-[13px] text-[#1d1d1f] outline-none w-64 transition-all focus:border-[#0071e3]"
        />

        <input
          type="number"
          min="0"
          step="1"
          placeholder="Min search volume"
          value={minSearchVolume}
          onChange={(e) => {
            const nextValue = e.target.value;
            startTransition(() => {
              setMinSearchVolume(nextValue);
            });
          }}
          className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg py-[7px] px-3 text-[13px] text-[#1d1d1f] outline-none w-44 transition-all focus:border-[#0071e3]"
        />

        <div className="flex flex-wrap items-center gap-2">
          {ALL_SOURCE_FILTERS.map((source) => {
            const active = selectedSources.includes(source);
            return (
              <button
                key={source}
                type="button"
                onClick={() => toggleSource(source)}
                className={`px-3 py-[7px] rounded-lg text-[13px] border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#e8f1fb] text-[#0071e3] border-[#0071e3]/30'
                    : 'bg-white text-[#6e6e73] border-[#d2d2d7]'
                }`}
              >
                {SOURCE_FILTER_LABELS[source]}
              </button>
            );
          })}
        </div>

        <input
          type="number"
          min="1"
          step="1"
          placeholder={canShowCompetitorRank ? 'Competitor max rank' : 'Select Competitor'}
          value={competitorMaxRank}
          onChange={(e) => {
            const nextValue = e.target.value;
            startTransition(() => {
              setCompetitorMaxRank(nextValue);
            });
          }}
          disabled={!canShowCompetitorRank}
          className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg py-[7px] px-3 text-[13px] text-[#1d1d1f] outline-none w-44 transition-all focus:border-[#0071e3] disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <input
          type="number"
          min="1"
          step="1"
          placeholder={canShowClientWebsiteRank ? 'Client web max rank' : 'Select Client Website'}
          value={clientWebsiteMaxRank}
          onChange={(e) => {
            const nextValue = e.target.value;
            startTransition(() => {
              setClientWebsiteMaxRank(nextValue);
            });
          }}
          disabled={!canShowClientWebsiteRank}
          className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg py-[7px] px-3 text-[13px] text-[#1d1d1f] outline-none w-44 transition-all focus:border-[#0071e3] disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <span className="text-[11px] text-[#8e8e93]">
          Seed is unaffected by rank filters. Competitor and Client Website are filtered separately.
        </span>
        <div className="flex items-center gap-3">
          <label className={`flex items-center gap-2 text-[12px] ${canShowCompetitorRank ? 'text-[#1d1d1f]' : 'text-[#8e8e93]'}`}>
            <input
              type="checkbox"
              checked={showCompetitorRank}
              onChange={(e) => setShowCompetitorRank(e.target.checked)}
              disabled={!canShowCompetitorRank}
              className="accent-[#0071e3]"
            />
            Competitor Rank
          </label>
          <label className={`flex items-center gap-2 text-[12px] ${canShowClientWebsiteRank ? 'text-[#1d1d1f]' : 'text-[#8e8e93]'}`}>
            <input
              type="checkbox"
              checked={showClientWebsiteRank}
              onChange={(e) => setShowClientWebsiteRank(e.target.checked)}
              disabled={!canShowClientWebsiteRank}
              className="accent-[#0071e3]"
            />
            Client Website Rank
          </label>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {isPending ? <span className="text-[11px] text-[#8e8e93]">Updating…</span> : null}
          <span
            className={`text-[11px] font-medium ${
              isCurrentFilterSaved ? 'text-[#2f855a]' : 'text-[#b45309]'
            }`}
          >
            {isCurrentFilterSaved
              ? `Saved filter${typeof savedKeywordCount === 'number' ? ` · ${savedKeywordCount}` : ''}`
              : 'Unsaved filter changes'}
          </span>
          <span className="text-[12px] text-[#8e8e93] font-mono">
            {visibleStart}-{visibleEnd} of {filteredRows.length} keywords
          </span>
          <select
            value={rowsPerPage}
            onChange={(e) => {
              const nextValue = Number(e.target.value);
              startTransition(() => {
                setRowsPerPage(nextValue);
              });
            }}
            className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg py-[7px] px-3 text-[13px] text-[#1d1d1f] outline-none w-28 transition-all focus:border-[#0071e3]"
          >
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
            <option value={200}>200 / page</option>
          </select>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[13px] font-medium text-[#6e6e73] bg-transparent border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-all cursor-pointer"
          >
            Reset Filters
          </button>
          <button
            type="button"
            onClick={handleSaveFilter}
            disabled={isCurrentFilterSaved}
            className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] border-none hover:opacity-90 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Filter
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[13px] font-medium text-[#6e6e73] bg-transparent border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-all cursor-pointer"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse table-fixed min-w-[640px]">
          <colgroup>
            <col className={showCompetitorRank || showClientWebsiteRank ? 'w-[58%]' : 'w-[70%]'} />
            <col className="w-[160px]" />
            {showCompetitorRank ? <col className="w-[150px]" /> : null}
            {showClientWebsiteRank ? <col className="w-[170px]" /> : null}
          </colgroup>
          <thead>
            <tr>
              <th className="bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10">
                Keyword
              </th>
              <th className="bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10">
                Search Volume
              </th>
              {showCompetitorRank ? (
                <th className="bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10">
                  Competitor Rank
                </th>
              ) : null}
              {showClientWebsiteRank ? (
                <th className="bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10">
                  Client Website Rank
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row) => (
              <TableRow
                key={row.keyword}
                row={row}
                showCompetitorRank={showCompetitorRank}
                showClientWebsiteRank={showClientWebsiteRank}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 pt-4 shrink-0">
        <div className="text-[12px] text-[#8e8e93]">
          {filteredRows.length === rows.length
            ? 'Showing all filtered results'
            : `Filtered from ${rows.length} total keywords`}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={currentPage <= 1}
            className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[13px] font-medium text-[#6e6e73] bg-transparent border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <div className="text-[12px] font-mono text-[#6e6e73] min-w-[72px] text-center">
            {currentPage} / {totalPages}
          </div>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={currentPage >= totalPages}
            className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[13px] font-medium text-[#6e6e73] bg-transparent border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
