export function AppFooter() {
  const currentYear = new Date().getFullYear();
  const yearText = currentYear > 2026 ? `2018-${currentYear}` : '2018-2026';

  return (
    <footer className="mt-auto border-t border-slate-200 bg-slate-950 px-6 py-6 text-center text-sm text-slate-400 dark:border-[var(--border-project-subtle)] dark:bg-[var(--surface-project-panel)]">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-center">
        <span>Copyright © {yearText} YMFE</span>
      </div>
    </footer>
  );
}
