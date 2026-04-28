interface SidebarStep {
  id: string;
  label: string;
  badge?: number;
  state: 'pending' | 'active' | 'complete';
}

interface SidebarProps {
  steps: SidebarStep[];
  onStepClick: (stepId: string) => void;
  allowPendingClicks?: boolean;
}

export function Sidebar({ steps, onStepClick, allowPendingClicks = false }: SidebarProps) {
  return (
    <nav className="w-[220px] bg-white border-r border-[#e8e8ed] flex flex-col shrink-0 overflow-y-auto py-4">
      <div className="text-[10px] font-semibold text-[#aeaeb2] tracking-[0.8px] uppercase px-4 mb-1">
        Workflow
      </div>

      {steps.map((step, i) => {
        const isActive = step.state === 'active';
        const isComplete = step.state === 'complete';
        const isPending = step.state === 'pending';
        const isClickable = allowPendingClicks || !isPending || step.id === 'topic-universe';

        return (
          <button
            key={step.id}
            onClick={() => {
              if (isClickable) onStepClick(step.id);
            }}
            disabled={!isClickable}
            className={`relative flex items-center gap-2.5 px-4 py-2 w-full text-left text-[13.5px] font-normal border-none transition-colors cursor-pointer bg-transparent ${
              isActive
                ? 'bg-[#e8f1fb] text-[#0071e3] font-medium'
                : isComplete
                ? 'text-[#6e6e73] hover:bg-[#f5f5f7]'
                : isClickable
                ? 'text-[#aeaeb2] hover:bg-[#f5f5f7]'
                : 'text-[#d2d2d7] cursor-not-allowed'
            }`}
          >
            {/* Active indicator bar */}
            {isActive && (
              <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-[#0071e3] rounded-r" />
            )}

            {/* Step number / check */}
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-semibold font-mono ${
                isActive
                  ? 'bg-[#0071e3] border-[#0071e3] text-white'
                  : isComplete
                  ? 'bg-[#34c759] border-[#34c759] text-white'
                  : 'bg-[#f5f5f7] border border-[#e8e8ed] text-[#d2d2d7]'
              }`}
            >
              {isComplete ? (
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
                  <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
                </svg>
              ) : (
                i + 1
              )}
            </div>

            {/* Label */}
            <span className="flex-1 min-w-0 truncate">{step.label}</span>

            {/* Badge */}
            {step.badge !== undefined && step.badge > 0 && (
              <span
                className={`ml-auto text-[10px] font-mono px-1.5 py-px rounded-[10px] border ${
                  isActive
                    ? 'bg-[#0071e3] text-white border-[#0071e3]'
                    : 'bg-[#f5f5f7] text-[#aeaeb2] border-[#d2d2d7]'
                }`}
              >
                {step.badge}
              </span>
            )}
          </button>
        );
      })}

      {/* Footer */}
      <div className="mt-auto pt-4 px-4 border-t border-[#e8e8ed]">
        <p className="text-[11px] text-[#aeaeb2] leading-relaxed">
          Powered by Convert Cake AI
          <br />
          © 2025 · v2.4.1
        </p>
      </div>
    </nav>
  );
}
