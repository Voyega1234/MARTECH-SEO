interface WorkspaceTabsProps {
  activeWorkspace: 'strategy' | 'paa-blog';
  onChange: (workspace: 'strategy' | 'paa-blog') => void;
}

const tabs = [
  {
    id: 'strategy' as const,
    label: 'Strategy Workflow',
    description: 'Topic universe > sitemap > matching',
  },
  {
    id: 'paa-blog' as const,
    label: 'PAA Blog',
    description: 'PAA + related searches',
  },
];

export function WorkspaceTabs({ activeWorkspace, onChange }: WorkspaceTabsProps) {
  const activeTab = tabs.find((tab) => tab.id === activeWorkspace) || tabs[0];

  return (
    <div className="border-b border-[#e8e8ed] bg-white px-6 py-3 shrink-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.7px] text-[#8e8e93]">Workspace</div>
          <div className="inline-flex rounded-full bg-[#f5f5f7] p-1 gap-1">
            {tabs.map((tab) => {
              const isActive = activeWorkspace === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onChange(tab.id)}
                  className={`rounded-full px-4 py-2 text-[13px] font-medium border-none transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white text-[#1d1d1f] shadow-sm ring-1 ring-[#e1e3e8]'
                      : 'bg-transparent text-[#6e6e73] hover:bg-white/70'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="text-[12px] text-[#6e6e73]">
          <span className="font-medium text-[#1d1d1f]">{activeTab.label}</span>
          <span className="text-[#aeaeb2]"> · </span>
          <span>{activeTab.description}</span>
        </div>
      </div>
    </div>
  );
}
