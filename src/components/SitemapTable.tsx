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
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.sections && Array.isArray(parsed.sections)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function PotentialPill({ level }: { level: string }) {
  const cls =
    level === 'High'
      ? 'text-emerald-600 bg-emerald-50 ring-emerald-500/10'
      : level === 'Medium'
      ? 'text-amber-600 bg-amber-50 ring-amber-500/10'
      : 'text-gray-500 bg-gray-50 ring-gray-500/10';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-sm font-medium ring-1 ring-inset ${cls}`}>
      {level}
    </span>
  );
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

export function SitemapTable({ data }: { data: string }) {
  const parsed = tryParseSitemapJSON(data);

  if (!parsed) {
    return (
      <pre className="text-sm text-gray-600 whitespace-pre-wrap font-mono leading-relaxed p-6">
        {data}
      </pre>
    );
  }

  const rows: {
    section: SitemapSection;
    keyword: SitemapKeyword;
    isFirstInSection: boolean;
    sectionRowSpan: number;
    isFirstKeyword: boolean;
  }[] = [];

  const sectionGroups = new Map<string, SitemapSection[]>();
  for (const s of parsed.sections) {
    const existing = sectionGroups.get(s.section) || [];
    existing.push(s);
    sectionGroups.set(s.section, existing);
  }

  let prevSectionName = '';
  for (const section of parsed.sections) {
    const isNewSection = section.section !== prevSectionName;
    const sectionKeywordCount = isNewSection
      ? sectionGroups.get(section.section)!.reduce((sum, s) => sum + Math.max(s.keywords.length, 1), 0)
      : 0;
    prevSectionName = section.section;

    if (section.keywords.length === 0) {
      rows.push({
        section,
        keyword: { keyword: '\u2014', volume: 0 },
        isFirstInSection: isNewSection,
        sectionRowSpan: sectionKeywordCount,
        isFirstKeyword: true,
      });
    } else {
      section.keywords.forEach((kw, kwIdx) => {
        rows.push({
          section,
          keyword: kw,
          isFirstInSection: isNewSection && kwIdx === 0,
          sectionRowSpan: sectionKeywordCount,
          isFirstKeyword: kwIdx === 0,
        });
      });
    }
  }

  const hasPosition = parsed.sections.some((s) =>
    s.keywords.some((kw) => kw.position !== undefined && kw.position !== null)
  );

  const totalKeywords = parsed.sections.reduce((sum, s) => sum + s.keywords.length, 0);

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
    downloadCsv('sitemap-plan.csv', [header.join(','), ...csvRows].join('\n'));
  };

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm text-gray-500 tracking-wide">
          <span>{parsed.sections.length} pages</span>
          <span className="w-px h-3 bg-gray-200" />
          <span>{totalKeywords} keywords</span>
        </div>
        <button
          onClick={exportCsv}
          className="px-3.5 py-1.5 text-sm font-medium text-gray-600 bg-white rounded-lg shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] hover:bg-gray-50 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.04)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-sm uppercase tracking-wider text-gray-500">
              <th className="pl-8 pr-3 py-3.5 font-medium">Section</th>
              <th className="px-3 py-3.5 font-medium">Sub-Section</th>
              <th className="px-3 py-3.5 font-medium">Page Title</th>
              <th className="px-3 py-3.5 font-medium">Path</th>
              <th className="px-3 py-3.5 font-medium">Group</th>
              <th className="px-3 py-3.5 font-medium">Keyword</th>
              <th className="px-3 py-3.5 font-medium text-right">Vol</th>
              {hasPosition && (
                <th className="px-3 py-3.5 font-medium text-right">Pos</th>
              )}
              <th className="px-3 py-3.5 font-medium text-center">Conv.</th>
              <th className="pl-3 pr-8 py-3.5 font-medium text-center">Traffic</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80">
            {rows.map((row, idx) => {
              const kwCount = Math.max(row.section.keywords.length, 1);
              return (
                <tr key={idx} className="transition-colors hover:bg-gray-50/60">
                  {row.isFirstInSection && (
                    <td
                      className="pl-8 pr-3 py-2.5 align-top text-gray-900 font-medium border-l-2 border-l-gray-900/10"
                      rowSpan={row.sectionRowSpan}
                    >
                      {row.section.section}
                    </td>
                  )}
                  {row.isFirstKeyword && (
                    <>
                      <td className="px-3 py-2.5 align-top text-gray-600" rowSpan={kwCount}>
                        {row.section.sub_section_or_category || '\u2014'}
                      </td>
                      <td className="px-3 py-2.5 align-top text-gray-900 font-medium" rowSpan={kwCount}>
                        {row.section.page_title}
                      </td>
                      <td className="px-3 py-2.5 align-top font-mono text-sm text-gray-500 tracking-tight" rowSpan={kwCount}>
                        {row.section.slug_and_path}
                      </td>
                      <td className="px-3 py-2.5 align-top text-gray-800" rowSpan={kwCount}>
                        {row.section.keyword_group}
                      </td>
                    </>
                  )}
                  <td className="px-3 py-2 text-gray-800">
                    {row.keyword.keyword}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                    {row.keyword.volume > 0 ? row.keyword.volume.toLocaleString() : '\u2014'}
                  </td>
                  {hasPosition && (
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                      {row.keyword.position !== undefined && row.keyword.position !== null && row.keyword.position > 0
                        ? row.keyword.position
                        : '\u2014'}
                    </td>
                  )}
                  {row.isFirstKeyword && (
                    <>
                      <td className="px-3 py-2.5 text-center align-top" rowSpan={kwCount}>
                        <PotentialPill level={row.section.conversion_potential} />
                      </td>
                      <td className="pl-3 pr-8 py-2.5 text-center align-top" rowSpan={kwCount}>
                        <PotentialPill level={row.section.traffic_potential} />
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
