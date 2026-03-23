import React, { useState, useMemo } from 'react';

interface SitemapKeyword {
  keyword: string;
  volume: number;
  position?: number;
}

interface SitemapSection {
  section: string;
  sub_section_or_category: string;
  page_title: string;
  slug_and_path: string;
  keywords: SitemapKeyword[];
  keyword_group: string;
  conversion_potential: string;
  traffic_potential: string;
}

interface SitemapData {
  sections: SitemapSection[];
}

function tryParseSitemapJSON(text: string): SitemapData | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed.sections && Array.isArray(parsed.sections)) return parsed;
  } catch { /* not pure JSON */ }

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '```json' || trimmed === '```') continue;
    if (trimmed.startsWith('{')) {
      const candidate = lines.slice(i).join('\n');
      let depth = 0;
      let end = -1;
      for (let j = 0; j < candidate.length; j++) {
        if (candidate[j] === '{') depth++;
        else if (candidate[j] === '}') {
          depth--;
          if (depth === 0) { end = j; break; }
        }
      }
      if (end > 0) {
        try {
          const parsed = JSON.parse(candidate.slice(0, end + 1));
          if (parsed.sections && Array.isArray(parsed.sections)) return parsed;
        } catch { /* try next */ }
      }
    }
  }
  return null;
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

const sectionIcons: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
  Home: {
    bg: 'bg-[#e8f1fb]',
    color: 'text-[#0071e3]',
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
        <path d="M8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 2 8h1v6a1 1 0 0 0 1 1h3v-4h2v4h3a1 1 0 0 0 1-1V8h1a.5.5 0 0 0 .354-.854l-6-6z" />
      </svg>
    ),
  },
  Service: {
    bg: 'bg-[#f0fdf4]',
    color: 'text-[#16a34a]',
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
        <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5h-3.32z" />
      </svg>
    ),
  },
  Price: {
    bg: 'bg-[#fff7ed]',
    color: 'text-[#ea580c]',
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
        <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm.75 4.75v.5h1.5a.75.75 0 0 1 0 1.5H7.5a.25.25 0 0 0 0 .5h1a1.75 1.75 0 0 1 .25 3.48v.52a.75.75 0 0 1-1.5 0v-.5H5.75a.75.75 0 0 1 0-1.5H8.5a.25.25 0 0 0 0-.5h-1a1.75 1.75 0 0 1-.25-3.48V4.75a.75.75 0 0 1 1.5 0z" />
      </svg>
    ),
  },
  Blog: {
    bg: 'bg-[#fdf4ff]',
    color: 'text-[#9333ea]',
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
        <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25v-9.5z" />
      </svg>
    ),
  },
};

function getSectionIcon(sectionName: string) {
  const lower = sectionName.toLowerCase();
  if (lower.includes('home') || lower.includes('หน้าแรก'))
    return sectionIcons.Home;
  if (lower.includes('service') || lower.includes('บริการ') || lower.includes('install') || lower.includes('ติดตั้ง'))
    return sectionIcons.Service;
  if (lower.includes('price') || lower.includes('ราคา') || lower.includes('cost'))
    return sectionIcons.Price;
  if (lower.includes('blog') || lower.includes('article') || lower.includes('บทความ') || lower.includes('info'))
    return sectionIcons.Blog;

  // Default
  return {
    bg: 'bg-[#f0f9ff]',
    color: 'text-[#0284c7]',
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
        <path d="M1.75 2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25H1.75zM0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75z" />
      </svg>
    ),
  };
}

function potentialBadge(level: string) {
  const cls =
    level === 'High'
      ? 'bg-[#e8faf0] text-[#1a7f3c]'
      : level === 'Medium'
      ? 'bg-[#fff5e6] text-[#b45309]'
      : 'bg-[#f5f5f7] text-[#6e6e73]';
  return (
    <span className={`inline-flex px-1.5 py-px rounded text-[10px] font-semibold ${cls}`}>
      {level}
    </span>
  );
}

type ViewMode = 'cards' | 'table';

export function SitemapTable({ data, projectName }: { data: string; projectName?: string }) {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const parsed = tryParseSitemapJSON(data);

  // Group sections by section name
  const groupedSections = useMemo(() => {
    if (!parsed) return new Map<string, SitemapSection[]>();
    const groups = new Map<string, SitemapSection[]>();
    for (const s of parsed.sections) {
      const existing = groups.get(s.section) || [];
      existing.push(s);
      groups.set(s.section, existing);
    }
    return groups;
  }, [parsed]);

  if (!parsed) {
    return (
      <pre className="text-[12px] text-[#6e6e73] whitespace-pre-wrap font-mono leading-relaxed p-6">
        {data}
      </pre>
    );
  }

  const hasPosition = parsed.sections.some((s) =>
    s.keywords.some((kw) => kw.position !== undefined && kw.position !== null)
  );

  const exportCsv = () => {
    const header = [
      'Section', 'Sub-Section', 'Page Title', 'Slug & Path',
      'Keyword Group', 'Keyword', 'Volume',
      ...(hasPosition ? ['Position'] : []),
      'Conversion Potential', 'Traffic Potential',
    ];
    const csvRows: string[] = [];
    for (const section of parsed.sections) {
      for (const kw of section.keywords) {
        csvRows.push([
          escapeCsv(section.section),
          escapeCsv(section.sub_section_or_category),
          escapeCsv(section.page_title),
          escapeCsv(section.slug_and_path),
          escapeCsv(section.keyword_group),
          escapeCsv(kw.keyword),
          String(kw.volume),
          ...(hasPosition ? [String(kw.position ?? '')] : []),
          escapeCsv(section.conversion_potential),
          escapeCsv(section.traffic_potential),
        ].join(','));
      }
    }
    const slug = (projectName || 'sitemap-plan').replace(/\s+/g, '-').toLowerCase();
    downloadCsv(`${slug}-sitemap.csv`, [header.join(','), ...csvRows].join('\n'));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2.5 pb-4 shrink-0">
        <div className="flex bg-[#f5f5f7] rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all cursor-pointer border-none ${
              viewMode === 'cards'
                ? 'bg-white text-[#1d1d1f] shadow-sm'
                : 'text-[#6e6e73] hover:text-[#1d1d1f] bg-transparent'
            }`}
          >
            Card View
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all cursor-pointer border-none ${
              viewMode === 'table'
                ? 'bg-white text-[#1d1d1f] shadow-sm'
                : 'text-[#6e6e73] hover:text-[#1d1d1f] bg-transparent'
            }`}
          >
            Table View
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-[#aeaeb2] font-mono">
            {parsed.sections.length} pages · {groupedSections.size} sections
          </span>
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

      {/* Card View */}
      {viewMode === 'cards' && (
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5 max-w-[1100px]">
            {Array.from(groupedSections.entries()).map(([sectionName, pages]) => {
              const icon = getSectionIcon(sectionName);
              return (
                <div
                  key={sectionName}
                  className="bg-white border border-[#e8e8ed] rounded-[14px] overflow-hidden transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.07)]"
                >
                  {/* Card Header */}
                  <div className="p-3.5 pb-3 border-b border-[#e8e8ed] flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${icon.bg} ${icon.color}`}>
                        {icon.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-[#1d1d1f] mb-0.5">
                          {sectionName}
                        </div>
                        <div className="font-mono text-[11px] text-[#aeaeb2] truncate">
                          /{sectionName.toLowerCase().replace(/\s+/g, '-')}/
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-wrap items-start">
                      <span className="inline-flex px-1.5 py-px rounded text-[10px] font-semibold bg-[#f5f5f7] text-[#6e6e73] border border-[#e8e8ed] font-mono">
                        {pages.length}
                      </span>
                    </div>
                  </div>

                  {/* Card Body - Page Rows */}
                  <div className="px-3.5 py-2.5 font-thai">
                    {pages.map((page, pi) => (
                      <div
                        key={pi}
                        className={`flex items-start gap-2.5 py-2 ${
                          pi < pages.length - 1 ? 'border-b border-[#e8e8ed]' : ''
                        }`}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-[#d2d2d7] mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-medium text-[#1d1d1f] truncate">
                            {page.page_title}
                          </div>
                          <div className="font-mono text-[10.5px] text-[#aeaeb2] mt-px truncate">
                            {page.slug_and_path}
                          </div>
                        </div>
                        <div className="text-[10.5px] text-[#aeaeb2] whitespace-nowrap shrink-0 font-mono mt-0.5">
                          {page.keywords.length} kw
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr>
                <th className="w-[120px] bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10">
                  Section
                </th>
                <th className="w-[120px] bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10">
                  Sub-Section
                </th>
                <th className="bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10">
                  Page Title
                </th>
                <th className="w-[160px] bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10">
                  Path
                </th>
                <th className="w-[200px] bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10">
                  Keywords
                </th>
                <th className="w-[80px] bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10">
                  Conv.
                </th>
                <th className="w-[80px] bg-white text-[11px] font-semibold text-[#6e6e73] uppercase tracking-[0.6px] py-2.5 px-3.5 text-left border-b border-[#d2d2d7] sticky top-0 z-10">
                  Traffic
                </th>
              </tr>
            </thead>
            <tbody className="font-thai">
              {parsed.sections.map((section, idx) => (
                <tr
                  key={idx}
                  className="border-b border-[#e8e8ed] last:border-b-0 transition-colors hover:bg-[#e8f1fb]"
                >
                  <td className="py-2.5 px-3.5 text-[13px] font-medium text-[#1d1d1f] align-top">
                    {section.section}
                  </td>
                  <td className="py-2.5 px-3.5 text-[13px] text-[#6e6e73] align-top">
                    {section.sub_section_or_category || '\u2014'}
                  </td>
                  <td className="py-2.5 px-3.5 align-top">
                    <div className="font-medium text-[13px] text-[#1d1d1f]">{section.page_title}</div>
                    <div className="font-mono text-[11px] text-[#6e6e73] mt-0.5">{section.keyword_group}</div>
                  </td>
                  <td className="py-2.5 px-3.5 font-mono text-[11px] text-[#6e6e73] align-top">
                    {section.slug_and_path}
                  </td>
                  <td className="py-2.5 px-3.5 align-top">
                    <div className="text-[12px] text-[#6e6e73] leading-relaxed">
                      {section.keywords.map((kw, ki) => (
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
                    {potentialBadge(section.conversion_potential)}
                  </td>
                  <td className="py-2.5 px-3.5 align-top">
                    {potentialBadge(section.traffic_potential)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
