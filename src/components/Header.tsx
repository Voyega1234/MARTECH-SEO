export function Header() {
  return (
    <header className="w-full bg-white border-b border-gray-200/60">
      <div className="max-w-[95vw] mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        <a href="/" className="flex items-center gap-2">
          <img src="/images/logo.png" alt="Convert Cake" className="h-12" />
          <span className="w-px h-4 bg-gray-200 mx-1" />
          <span className="text-sm text-gray-400 font-medium">
            SEO Planner
          </span>
        </a>
      </div>
    </header>
  );
}
