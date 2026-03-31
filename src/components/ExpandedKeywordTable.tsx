import { memo, useDeferredValue, useEffect, useMemo, useState, useTransition } from 'react';
import type { KeywordExpansionKeywordRow } from '../features/keyword-expansion/types';

type OptionalColumn =
  | 'source_refs'
  | 'latest_monthly_search_volume'
  | 'cpc'
  | 'competition';

const COLUMN_LABELS: Record<OptionalColumn, string> = {
  source_refs: 'Sources',
  latest_monthly_search_volume: 'Latest Monthly Volume',
  cpc: 'CPC',
  competition: 'Competition',
};

const DEFAULT_COLUMNS: OptionalColumn[] = ['source_refs', 'cpc', 'competition'];

type SourceCatalog = {
  s: string[];
  c: string[];
  w: string[];
};

type SourceTypeFilter = 'all' | 'seed' | 'competitor' | 'client_website';

const SOURCE_FILTER_LABELS: Record<SourceTypeFilter, string> = {
  all: 'All Sources',
  seed: 'Seed',
  competitor: 'Competitor',
  client_website: 'Client Website',
};

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

function metricValue(
  row: KeywordExpansionKeywordRow,
  column: OptionalColumn,
  sourceCatalog?: SourceCatalog
): string {
  const value = row[column];
  if (Array.isArray(value)) {
    if (column === 'source_refs') {
      return value.map((ref) => resolveSourceRefValue(ref, sourceCatalog)).join(' | ');
    }
    return value.join(' | ');
  }
  if (value === null || value === undefined) return '-';
  return String(value);
}

const TableRow = memo(function TableRow({
  row,
  index,
  visibleColumns,
  sourceCatalog,
}: {
  row: KeywordExpansionKeywordRow;
  index: number;
  visibleColumns: OptionalColumn[];
  sourceCatalog?: SourceCatalog;
}) {
  return (
    <tr className="border-b border-[#e8e8ed] hover:bg-[#f8fbff]">
      <td className="py-2.5 px-3.5 text-[13px] text-[#1d1d1f] break-words align-top">
        {row.keyword}
      </td>
      <td className="py-2.5 px-3.5 text-[13px] text-[#1d1d1f] font-mono align-top whitespace-nowrap">
        {row.search_volume}
      </td>
      {visibleColumns.map((column) => (
        <td key={`${index}-${column}`} className="py-2.5 px-3.5 text-[13px] text-[#6e6e73] align-top break-words">
          {metricValue(row, column, sourceCatalog)}
        </td>
      ))}
    </tr>
  );
});

export function ExpandedKeywordTable({
  rows,
  projectName,
  sourceCatalog,
}: {
  rows: KeywordExpansionKeywordRow[];
  projectName?: string;
  sourceCatalog?: SourceCatalog;
}) {
  const [search, setSearch] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<OptionalColumn[]>(DEFAULT_COLUMNS);
  const [minSearchVolume, setMinSearchVolume] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceTypeFilter>('all');
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const deferredSearch = useDeferredValue(search);
  const deferredVisibleColumns = useDeferredValue(visibleColumns);
  const deferredMinSearchVolume = useDeferredValue(minSearchVolume);
  const deferredSourceFilter = useDeferredValue(sourceFilter);

  const filteredRows = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const minVolume = Number(deferredMinSearchVolume);

    return rows.filter((row) => {
      const searchMatch =
        !query ||
        row.keyword.toLowerCase().includes(query) ||
        (row.source_refs || []).some((source) =>
          resolveSourceRefValue(source, sourceCatalog).toLowerCase().includes(query)
        );

      if (!searchMatch) return false;

      const volume = typeof row.search_volume === 'number' ? row.search_volume : 0;
      const volumeMatch = !deferredMinSearchVolume.trim() || volume >= minVolume;
      if (!volumeMatch) return false;

      if (deferredSourceFilter === 'all') return true;
      return (row.source_refs || []).some((source) => {
        const sourceType = sourceTypeFromRef(source);
        return sourceType ? sourceType === deferredSourceFilter : false;
      });
    });
  }, [rows, deferredSearch, deferredMinSearchVolume, deferredSourceFilter, sourceCatalog]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, deferredMinSearchVolume, deferredSourceFilter, rowsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [currentPage, filteredRows, rowsPerPage]);

  const visibleStart = filteredRows.length ? (currentPage - 1) * rowsPerPage + 1 : 0;
  const visibleEnd = filteredRows.length ? Math.min(currentPage * rowsPerPage, filteredRows.length) : 0;

  const toggleColumn = (column: OptionalColumn) => {
    startTransition(() => {
      setVisibleColumns((current) =>
        current.includes(column) ? current.filter((item) => item !== column) : [...current, column]
      );
    });
  };

  const resetFilters = () => {
    startTransition(() => {
      setSearch('');
      setMinSearchVolume('');
      setSourceFilter('all');
    });
  };

  const exportCsv = () => {
    const headers = ['Keyword', 'Search Volume', ...deferredVisibleColumns.map((column) => COLUMN_LABELS[column])];
    const csvRows = filteredRows.map((row) =>
      [
        escapeCsv(row.keyword),
        String(row.search_volume),
        ...deferredVisibleColumns.map((column) => escapeCsv(metricValue(row, column, sourceCatalog))),
      ].join(',')
    );
    const slug = (projectName || 'expanded-keywords').replace(/\s+/g, '-').toLowerCase();
    downloadCsv(`${slug}-expanded-keywords.csv`, [headers.join(','), ...csvRows].join('\n'));
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

        <select
          value={sourceFilter}
          onChange={(e) => {
            const nextValue = e.target.value as SourceTypeFilter;
            startTransition(() => {
              setSourceFilter(nextValue);
            });
          }}
          className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg py-[7px] px-3 text-[13px] text-[#1d1d1f] outline-none w-44 transition-all focus:border-[#0071e3]"
        >
          {Object.entries(SOURCE_FILTER_LABELS).map(([filter, label]) => (
            <option key={filter} value={filter}>
              {label}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(COLUMN_LABELS).map(([column, label]) => {
            const typedColumn = column as OptionalColumn;
            const active = visibleColumns.includes(typedColumn);
            return (
              <button
                key={column}
                type="button"
                onClick={() => toggleColumn(typedColumn)}
                className={`px-2.5 py-1 rounded-full text-[12px] border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#e8f1fb] text-[#0071e3] border-[#0071e3]/30'
                    : 'bg-white text-[#6e6e73] border-[#d2d2d7]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {isPending ? <span className="text-[11px] text-[#8e8e93]">Updating…</span> : null}
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
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[13px] font-medium text-[#6e6e73] bg-transparent border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-all cursor-pointer"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse table-fixed min-w-[840px]">
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[120px]" />
            {deferredVisibleColumns.map((column) => (
              <col key={column} className="w-[150px]" />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10">
                Keyword
              </th>
              <th className="bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10">
                Search Volume
              </th>
              {deferredVisibleColumns.map((column) => (
                <th
                  key={column}
                  className="bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10"
                >
                  {COLUMN_LABELS[column]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, index) => (
              <TableRow
                key={`${row.keyword}-${visibleStart + index}`}
                row={row}
                index={visibleStart + index}
                visibleColumns={deferredVisibleColumns}
                sourceCatalog={sourceCatalog}
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
