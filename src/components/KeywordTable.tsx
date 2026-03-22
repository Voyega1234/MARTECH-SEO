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

function IntentDot({ intent }: { intent: string }) {
  const color =
    intent === 'Transactional'
      ? 'bg-emerald-400'
      : intent === 'Commercial'
      ? 'bg-amber-400'
      : 'bg-blue-400';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span className="text-sm text-gray-600 tracking-wide">{intent}</span>
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
  // Add BOM for Excel UTF-8 compatibility
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function KeywordTable({ data }: { data: string }) {
  const parsed = tryParseJSON(data);

  if (!parsed) {
    return (
      <pre className="text-sm text-gray-600 whitespace-pre-wrap font-mono leading-relaxed p-6">
        {data}
      </pre>
    );
  }

  const rows: {
    productLine: string;
    pillar: string;
    intent: string;
    group: string;
    slug: string;
    keyword: string;
    volume: number;
    pillarRowSpan: number;
    groupRowSpan: number;
    isFirstInPillar: boolean;
    isFirstInGroup: boolean;
    productLineRowSpan: number;
    isFirstInProductLine: boolean;
  }[] = [];

  for (const pl of parsed.product_lines) {
    let plKeywordCount = 0;
    for (const pillar of pl.topic_pillars) {
      for (const group of pillar.keyword_groups) {
        plKeywordCount += group.keywords.length;
      }
    }

    let isFirstPL = true;
    for (const pillar of pl.topic_pillars) {
      let pillarKeywordCount = 0;
      for (const group of pillar.keyword_groups) {
        pillarKeywordCount += group.keywords.length;
      }

      let isFirstPillar = true;
      for (const group of pillar.keyword_groups) {
        let isFirstGroup = true;
        for (const kw of group.keywords) {
          rows.push({
            productLine: pl.product_line,
            pillar: pillar.topic_pillar,
            intent: pillar.pillar_intent,
            group: group.keyword_group,
            slug: group.url_slug,
            keyword: kw.keyword,
            volume: kw.volume,
            pillarRowSpan: pillarKeywordCount,
            groupRowSpan: group.keywords.length,
            isFirstInPillar: isFirstPillar,
            isFirstInGroup: isFirstGroup,
            productLineRowSpan: plKeywordCount,
            isFirstInProductLine: isFirstPL,
          });
          isFirstPillar = false;
          isFirstGroup = false;
          isFirstPL = false;
        }
      }
    }
  }

  const totalVolume = rows.reduce((sum, r) => sum + r.volume, 0);

  const exportCsv = () => {
    const header = ['Product Line', 'Topic Pillar', 'Intent', 'Keyword Group', 'URL Slug', 'Keyword', 'Volume'];
    const csvRows = rows.map((r) => [
      escapeCsv(r.productLine),
      escapeCsv(r.pillar),
      escapeCsv(r.intent),
      escapeCsv(r.group),
      escapeCsv(r.slug),
      escapeCsv(r.keyword),
      String(r.volume),
    ].join(','));
    downloadCsv('keyword-map.csv', [header.join(','), ...csvRows].join('\n'));
  };

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm text-gray-500 tracking-wide">
          <span>{parsed.location}</span>
          <span className="w-px h-3 bg-gray-200" />
          <span>{rows.length} keywords</span>
          <span className="w-px h-3 bg-gray-200" />
          <span>{totalVolume.toLocaleString()} total volume</span>
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
              <th className="pl-8 pr-3 py-3.5 font-medium">Product Line</th>
              <th className="px-3 py-3.5 font-medium">Pillar</th>
              <th className="px-3 py-3.5 font-medium">Intent</th>
              <th className="px-3 py-3.5 font-medium">Group</th>
              <th className="px-3 py-3.5 font-medium">Slug</th>
              <th className="px-3 py-3.5 font-medium">Keyword</th>
              <th className="pl-3 pr-8 py-3.5 font-medium text-right">Volume</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80">
            {rows.map((row, idx) => (
              <tr
                key={idx}
                className="transition-colors hover:bg-gray-50/60"
              >
                {row.isFirstInProductLine && (
                  <td
                    className="pl-8 pr-3 py-2.5 align-top text-gray-900 font-medium border-l-2 border-l-gray-900/10"
                    rowSpan={row.productLineRowSpan}
                  >
                    {row.productLine}
                  </td>
                )}
                {row.isFirstInPillar && (
                  <>
                    <td
                      className="px-3 py-2.5 align-top text-gray-800"
                      rowSpan={row.pillarRowSpan}
                    >
                      {row.pillar}
                    </td>
                    <td
                      className="px-3 py-2.5 align-top"
                      rowSpan={row.pillarRowSpan}
                    >
                      <IntentDot intent={row.intent} />
                    </td>
                  </>
                )}
                {row.isFirstInGroup && (
                  <>
                    <td
                      className="px-3 py-2.5 align-top text-gray-800 font-medium"
                      rowSpan={row.groupRowSpan}
                    >
                      {row.group}
                    </td>
                    <td
                      className="px-3 py-2.5 align-top font-mono text-sm text-gray-500 tracking-tight"
                      rowSpan={row.groupRowSpan}
                    >
                      {row.slug}
                    </td>
                  </>
                )}
                <td className="px-3 py-2 text-gray-800">
                  {row.keyword}
                </td>
                <td className="pl-3 pr-8 py-2 text-right tabular-nums text-gray-600">
                  {row.volume.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
