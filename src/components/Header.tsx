interface HeaderProps {
  projectName?: string;
  onNewProject?: () => void;
  onOpenProjects?: () => void;
  onExportCsv?: () => void;
  showActions?: boolean;
}

export function Header({ projectName, onNewProject, onOpenProjects, onExportCsv, showActions = false }: HeaderProps) {
  return (
    <header className="h-[64px] bg-white/85 backdrop-blur-[20px] border-b border-[#e8e8ed] flex items-center px-6 gap-4 relative z-[100] shrink-0">
      {/* Logo */}
      <a href="/" className="flex items-center gap-2 no-underline shrink-0">
        <img src="/images/logo.png" alt="Convert Cake" className="h-9 w-auto object-contain block" />
        <span className="text-[10px] font-medium text-[#0071e3] bg-[#e8f1fb] px-[7px] py-[2px] rounded-[20px] tracking-[0.2px] font-mono">
          AI SEO
        </span>
      </a>

      {/* Divider + Project */}
      {projectName && (
        <>
          <div className="w-px h-5 bg-[#d2d2d7] mx-1" />
          <span className="text-[13px] text-[#6e6e73]">Project&nbsp;</span>
          <span className="text-[13px] text-[#1d1d1f] font-medium">{projectName}</span>
        </>
      )}

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-2">
        {/* Status */}
        <div className="flex items-center gap-1.5 text-[11.5px] text-[#6e6e73] px-3 py-2 bg-[#f5f5f7] rounded-lg border border-[#e8e8ed]">
          <div className="w-1.5 h-1.5 rounded-full bg-[#34c759] animate-pulse" />
          AI Ready
        </div>

        {showActions && onExportCsv && (
          <button
            onClick={onExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-lg text-[13px] font-medium text-[#6e6e73] bg-transparent border border-[#d2d2d7] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition-all cursor-pointer"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M2 4h12v1.5H2zM2 7.25h9v1.5H2zM2 10.5h6v1.5H2z"/></svg>
            Export CSV
          </button>
        )}

        {onOpenProjects && (
          <button
            onClick={onOpenProjects}
            className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-lg text-[13px] font-medium text-[#6e6e73] bg-transparent border border-[#d2d2d7] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition-all cursor-pointer"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5L6.032 1.446A1.75 1.75 0 0 0 4.756 1H1.75zM1.5 2.75a.25.25 0 0 1 .25-.25h3.006a.25.25 0 0 1 .176.073L6.61 4.25H1.5V2.75zm0 3h12.75a.25.25 0 0 1 .25.25v7.25a.25.25 0 0 1-.25.25H1.75a.25.25 0 0 1-.25-.25V5.75z"/></svg>
            My Projects
          </button>
        )}

        {onNewProject && (
          <button
            onClick={onNewProject}
            className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-lg text-[13px] font-medium text-white bg-[#0071e3] border-none hover:bg-[#0077ed] active:scale-[0.98] transition-all cursor-pointer"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z"/></svg>
            New Project
          </button>
        )}
      </div>
    </header>
  );
}
