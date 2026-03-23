import { useTr } from "../../lib/i18n";
import SettingCard from "./SettingCard";
import type { SectionFeedbackHandlers } from "./types";

function DataSection({ onMessage }: SectionFeedbackHandlers) {
  const { t } = useTr();
  const clearCache = () => {
    window.localStorage.removeItem("jessie-chat");
    onMessage(t("Cache cleared. Restarting Jessie...", "缓存已清除，正在重启 Jessie..."), false);
    window.setTimeout(() => window.location.reload(), 600);
  };

  const resetAppData = () => {
    window.localStorage.removeItem("jessie-chat");
    window.localStorage.removeItem("jessie-memory");
    window.localStorage.removeItem("jessie-settings");
    onMessage(t("App data reset. Restarting Jessie...", "应用数据已重置，正在重启 Jessie..."), false);
    window.setTimeout(() => window.location.reload(), 600);
  };

  return (
    <div className="space-y-4">
      <SettingCard
        title={t("Storage", "存储")}
        description={t("Current app data storage location.", "当前应用数据存储位置。")}
      >
        <div className="rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]">
          {t("Local storage (Tauri WebView)", "本地存储（Tauri WebView）")}
        </div>
      </SettingCard>

      <SettingCard
        title={t("Maintenance", "维护")}
        description={t("Manage local cache and data reset actions.", "管理本地缓存和数据重置操作。")}
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={clearCache}
            className="inline-flex h-8 items-center rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
          >
            {t("Clear cache", "清除缓存")}
          </button>
          <button
            type="button"
            onClick={resetAppData}
            className="inline-flex h-8 items-center rounded-lg border border-red-400/30 px-3 text-xs text-red-300 transition hover:bg-red-500/10"
          >
            {t("Reset app data", "重置应用数据")}
          </button>
        </div>
      </SettingCard>
    </div>
  );
}

export default DataSection;
