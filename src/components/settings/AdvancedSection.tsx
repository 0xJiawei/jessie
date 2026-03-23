import { useTr } from "../../lib/i18n";
import SettingCard from "./SettingCard";
import SettingToggle from "./SettingToggle";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { SectionFeedbackHandlers } from "./types";

function AdvancedSection({ onSaved, onMessage }: SectionFeedbackHandlers) {
  const { t } = useTr();
  const debugMode = useSettingsStore((state) => state.debugMode);
  const experimentalFeatures = useSettingsStore((state) => state.experimentalFeatures);
  const setDebugMode = useSettingsStore((state) => state.setDebugMode);
  const setExperimentalFeatures = useSettingsStore((state) => state.setExperimentalFeatures);

  return (
    <div className="space-y-4">
      <SettingCard
        title={t("Debug", "调试")}
        description={t("Developer and diagnostics switches.", "开发与诊断开关。")}
      >
        <div className="space-y-2">
          <SettingToggle
            label={t("Debug Mode", "调试模式")}
            description={t("Enable verbose diagnostics", "启用详细诊断日志")}
            checked={debugMode}
            onChange={(value) => {
              setDebugMode(value);
              onSaved();
            }}
          />
          <button
            type="button"
            onClick={() => {
              onMessage(
                t(
                  "Open DevTools from Tauri window menu for detailed logs.",
                  "可从 Tauri 窗口菜单打开 DevTools 查看详细日志。"
                ),
                false
              );
            }}
            className="inline-flex h-8 items-center rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
          >
            {t("Show logs", "查看日志")}
          </button>
        </div>
      </SettingCard>

      <SettingCard
        title={t("Experimental", "实验功能")}
        description={t("Early features that may change.", "仍在早期，后续可能调整。")}
      >
        <SettingToggle
          label={t("Experimental Features", "启用实验功能")}
          description={t("Enable preview functionality", "开启预览中的功能")}
          checked={experimentalFeatures}
          onChange={(value) => {
            setExperimentalFeatures(value);
            onSaved();
          }}
        />
      </SettingCard>
    </div>
  );
}

export default AdvancedSection;
