import SettingCard from "./SettingCard";
import type { SectionFeedbackHandlers } from "./types";

function DataSection({ onMessage }: SectionFeedbackHandlers) {
  const clearCache = () => {
    window.localStorage.removeItem("jessie-chat");
    onMessage("Cache cleared. Restarting Jessie...", false);
    window.setTimeout(() => window.location.reload(), 600);
  };

  const resetAppData = () => {
    window.localStorage.removeItem("jessie-chat");
    window.localStorage.removeItem("jessie-memory");
    window.localStorage.removeItem("jessie-settings");
    onMessage("App data reset. Restarting Jessie...", false);
    window.setTimeout(() => window.location.reload(), 600);
  };

  return (
    <div className="space-y-4">
      <SettingCard title="Storage" description="Current app data storage location.">
        <div className="rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]">
          Local storage (Tauri WebView)
        </div>
      </SettingCard>

      <SettingCard title="Maintenance" description="Manage local cache and data reset actions.">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={clearCache}
            className="inline-flex h-8 items-center rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
          >
            Clear cache
          </button>
          <button
            type="button"
            onClick={resetAppData}
            className="inline-flex h-8 items-center rounded-lg border border-red-400/30 px-3 text-xs text-red-300 transition hover:bg-red-500/10"
          >
            Reset app data
          </button>
        </div>
      </SettingCard>
    </div>
  );
}

export default DataSection;
