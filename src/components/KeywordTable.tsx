import { useState, useMemo } from 'react';

interface Keyword {
  keyword: string;
  volume: number;
}

interface KeywordGroup {
  keyword_group: string;
  url_slug: string;
  keywords: Keyword[];
}

interface TopicPillar {
  topic_pillar: string;
  pillar_intent: string;
  keyword_groups: KeywordGroup[];
}

interface ProductLine {
  product_line: string;
  topic_pillars: TopicPillar[];
}

interface KeywordData {
  location: string;
  product_lines: ProductLine[];
}

function tryParseJSON(text: string): KeywordData | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.product_lines) return parsed;
    return null;
  } catch {
    return null;
  }
}

interface FlatRow {
  productLine: string;
  pillar: string;
  intent: string;
  group: string;
  slug: string;
  keywords: Keyword[];
  totalVolume: number;
}

function getConversionLevel(intent: string): { dot: string; label: string } {
  if (intent === 'Transactional') return { dot: 'bg-[#34c759]', label: 'High' };
  if (intent === 'Commercial') return { dot: 'bg-[#ff9f0a]', label: 'Medium' };
  return { dot: 'bg-[#aeaeb2]', label: 'Low' };
}

function getTrafficLevel(totalVolume: number): { dot: string; label: string } {
  if (totalVolume >= 3000) return { dot: 'bg-[#34c759]', label: 'High' };
  if (totalVolume >= 1000) return { dot: 'bg-[#ff9f0a]', label: 'Medium' };
  return { dot: 'bg-[#aeaeb2]', label: 'Low' };
}

function escapeCsv(val: string): string {
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

type FilterType = 'all' | 'high-conv' | 'high-traffic';

export function KeywordTable({ data }: { data: string }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const parsed = tryParseJSON(data);

  const allRows: FlatRow[] = useMemo(() => {
    if (!parsed) return [];
    const rows: FlatRow[] = [];
    for (const pl of parsed.product_lines) {
      for (const pillar of pl.topic_pillars) {
        for (const group of pillar.keyword_groups) {
          const totalVolume = group.keywords.reduce((s, k) => s + k.volume, 0);
          rows.push({
            productLine: pl.product_line,
            pillar: pillar.topic_pillar,
            intent: pillar.pillar_intent,
            group: group.keyword_group,
            slug: group.url_slug,
            keywords: group.keywords,
            totalVolume,
          });
        }
      }
    }
    return rows;
  }, [parsed]);

  const filteredRows = useMemo(() => {
    let rows = allRows;

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.group.toLowerCase().includes(q) ||
          r.pillar.toLowerCase().includes(q) ||
          r.productLine.toLowerCase().includes(q) ||
          r.keywords.some((k) => k.keyword.toLowerCase().includes(q))
      );
    }

    if (filter === 'high-conv') {
      rows = rows.filter((r) => r.intent === 'Transactional');
    } else if (filter === 'high-traffic') {
      rows = rows.filter((r) => r.totalVolume >= 3000);
    }

    return rows;
  }, [allRows, search, filter]);

  const exportCsv = () => {
    const header = ['Product Line', 'Topic Pillar', 'Intent', 'Keyword Group', 'URL Slug', 'Keyword', 'Volume'];
    const csvRows: string[] = [];
    for (const row of allRows) {
      for (const kw of row.keywords) {
        csvRows.push(
          [
            escapeCsv(row.productLine),
            escapeCsv(row.pillar),
            escapeCsv(row.intent),
            escapeCsv(row.group),
            escapeCsv(row.slug),
            escapeCsv(kw.keyword),
            String(kw.volume),
          ].join(',')
        );
      }
    }
    downloadCsv('keyword-map.csv', [header.join(','), ...csvRows].join('\n'));
  };

  if (!parsed) {
    return (
      <pre className="text-[12px] text-[#6e6e73] whitespace-pre-wrap font-mono leading-relaxed p-6">
        {data}
      </pre>
    );
  }

  const intentPill = (intent: string) => {
    const cls =
      intent === 'Transactional'
        ? 'bg-[#e8faf0] text-[#1a7f3c]'
        : intent === 'Commercial'
        ? 'bg-[#fff5e6] text-[#b45309]'
        : 'bg-[#f5f5f7] text-[#6e6e73] border border-[#d2d2d7]';
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-[20px] text-[10px] font-semibold tracking-[0.2px] whitespace-nowrap font-mono ${cls}`}>
        {intent}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2.5 pb-4 shrink-0">
        <div className="relative">
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#aeaeb2] pointer-events-none"
          >
            <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
          </svg>
          <input
            type="text"
            placeholder="Search keyword groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg py-[7px] pl-8 pr-3 text-[13px] text-[#1d1d1f] outline-none w-60 transition-all focus:border-[#0071e3] focus:shadow-[0_0_0_3px_rgba(0,113,227,0.1)]"
          />
        </div>

        <div className="w-px h-5 bg-[#d2d2d7]" />

        {(['all', 'high-conv', 'high-traffic'] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-[20px] text-[12px] font-medium border transition-all cursor-pointer ${
              filter === f
                ? 'bg-[#0071e3] text-white border-[#0071e3]'
                : 'bg-white text-[#6e6e73] border-[#d2d2d7] hover:border-[#0071e3] hover:text-[#0071e3]'
            }`}
          >
            {f === 'all' ? 'All' : f === 'high-conv' ? 'High Conv.' : 'High Traffic'}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-[#aeaeb2] font-mono">{filteredRows.length} groups</span>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[13px] font-medium text-[#6e6e73] bg-transparent border border-[#d2d2d7] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition-all cursor-pointer"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M2 4h12v1.5H2zM2 7.25h9v1.5H2zM2 10.5h6v1.5H2z" />
            </svg>
            CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse min-w-[900px]">
          <thead>
            <tr>
              <th className="w-[100px] bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10 whitespace-nowrap">
                Product Line
              </th>
              <th className="w-[140px] bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10 whitespace-nowrap">
                Topic Pillar
              </th>
              <th className="w-[110px] bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10 whitespace-nowrap">
                Intent
              </th>
              <th className="w-[180px] bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10 whitespace-nowrap">
                Keyword Group
              </th>
              <th className="bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10 whitespace-nowrap">
                Keywords (L3)
              </th>
              <th className="w-[100px] bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10 whitespace-nowrap">
                Conversion
              </th>
              <th className="w-[100px] bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10 whitespace-nowrap">
                Traffic
              </th>
            </tr>
          </thead>
          <tbody className="font-thai">
            {filteredRows.map((row, idx) => {
              const conv = getConversionLevel(row.intent);
              const traffic = getTrafficLevel(row.totalVolume);

              return (
                <tr
                  key={idx}
                  className="border-b border-[#e8e8ed] last:border-b-0 transition-colors hover:bg-[#e8f1fb]"
                >
                  <td className="py-2.5 px-3.5 text-[13px] align-top">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-[20px] text-[11px] font-semibold tracking-[0.2px] whitespace-nowrap bg-[#e8f1fb] text-[#0071e3]">
                      {row.productLine}
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5 text-[13px] font-medium text-[#1d1d1f] align-top">
                    {row.pillar}
                  </td>
                  <td className="py-2.5 px-3.5 align-top">{intentPill(row.intent)}</td>
                  <td className="py-2.5 px-3.5 align-top">
                    <div className="font-medium text-[13px] text-[#1d1d1f]">{row.group}</div>
                    <div className="font-mono text-[11px] text-[#6e6e73] mt-0.5">{row.slug}</div>
                  </td>
                  <td className="py-2.5 px-3.5 align-top">
                    <div className="text-[12px] text-[#6e6e73] leading-relaxed">
                      {row.keywords.map((kw, ki) => (
                        <span key={ki} className="inline mr-1">
                          {kw.keyword}{' '}
                          <span className="font-mono text-[11px] text-[#aeaeb2] bg-[#f5f5f7] px-1 py-px rounded border border-[#e8e8ed] whitespace-nowrap">
                            {kw.volume.toLocaleString()}
                          </span>{' '}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 px-3.5 align-top">
                    <div className="flex items-center text-[12px] font-medium">
                      <div className={`w-[7px] h-[7px] rounded-full mr-1.5 shrink-0 ${conv.dot}`} />
                      {conv.label}
                    </div>
                  </td>
                  <td className="py-2.5 px-3.5 align-top">
                    <div className="flex items-center text-[12px] font-medium">
                      <div className={`w-[7px] h-[7px] rounded-full mr-1.5 shrink-0 ${traffic.dot}`} />
                      {traffic.label}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
