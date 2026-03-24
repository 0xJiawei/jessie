import { useEffect, useMemo, useRef, useState } from "react";
import { useTr } from "../lib/i18n";
import { useSettingsStore, type SettingsTab } from "../store/useSettingsStore";
import { useToastStore } from "../store/useToastStore";
import AdvancedSection from "./settings/AdvancedSection";
import AppearanceSection from "./settings/AppearanceSection";
import DataSection from "./settings/DataSection";
import GeneralSection from "./settings/GeneralSection";
import MemorySection from "./settings/MemorySection";
import McpSection from "./settings/McpSection";
import ModelsSection from "./settings/ModelsSection";
import SettingsSidebar from "./settings/SettingsSidebar";

function SettingsPanel() {
  const { t } = useTr();
  const isSettingsOpen = useSettingsStore((state) => state.isSettingsOpen);
  const activeTab = useSettingsStore((state) => state.settingsTab);
  const setActiveTab = useSettingsStore((state) => state.setSettingsTab);
  const closeSettings = useSettingsStore((state) => state.closeSettings);
  const pushToast = useToastStore((state) => state.pushToast);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveDebounceRef = useRef<number | null>(null);
  const saveHideRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      closeSettings();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSettingsOpen, closeSettings]);

  const panelClassName = useMemo(
    () =>
      `pointer-events-auto absolute left-0 top-0 h-full w-[860px] overflow-hidden border-r border-[color:var(--border)] bg-[var(--panel-bg)] shadow-panel transition-transform duration-300 ${
        isSettingsOpen ? "translate-x-0" : "-translate-x-full"
      }`,
    [isSettingsOpen]
  );

  useEffect(
    () => () => {
      if (saveDebounceRef.current) {
        window.clearTimeout(saveDebounceRef.current);
      }
      if (saveHideRef.current) {
        window.clearTimeout(saveHideRef.current);
      }
    },
    []
  );

  const showSavedIndicator = () => {
    setSaveStatus("saving");

    if (saveDebounceRef.current) {
      window.clearTimeout(saveDebounceRef.current);
    }
    if (saveHideRef.current) {
      window.clearTimeout(saveHideRef.current);
    }

    saveDebounceRef.current = window.setTimeout(() => {
      setSaveStatus("saved");
      saveHideRef.current = window.setTimeout(() => {
        setSaveStatus("idle");
      }, 1400);
    }, 700);
  };

  const showMessage = (message: string, isError = false) => {
    pushToast(message, isError ? "error" : "success");
  };

  const sectionProps = {
    onSaved: showSavedIndicator,
    onMessage: showMessage,
  };

  const renderSection = (tab: SettingsTab) => {
    switch (tab) {
      case "general":
        return <GeneralSection {...sectionProps} />;
      case "models":
        return <ModelsSection {...sectionProps} />;
      case "mcp":
        return <McpSection {...sectionProps} />;
      case "memory":
        return <MemorySection {...sectionProps} />;
      case "data":
        return <DataSection {...sectionProps} />;
      case "appearance":
        return <AppearanceSection {...sectionProps} />;
      case "advanced":
        return <AdvancedSection {...sectionProps} />;
      default:
        return <GeneralSection {...sectionProps} />;
    }
  };

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-30 transition ${
        isSettingsOpen ? "opacity-100" : "opacity-0"
      }`}
    >
      <button
        type="button"
        aria-label={t("Close settings", "关闭设置")}
        onClick={closeSettings}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          isSettingsOpen ? "pointer-events-auto opacity-100" : "opacity-0"
        }`}
      />

      <aside className={panelClassName}>
        <div className="relative flex h-full">
          <SettingsSidebar activeTab={activeTab} onChange={setActiveTab} />

          <div className="relative min-w-0 flex-1">
            <div className="flex h-14 items-center justify-between border-b border-[color:var(--border)] px-5">
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("Jessie Settings", "Jessie 设置")}
                </p>
                {saveStatus !== "idle" && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    {saveStatus === "saving" ? t("Saving...", "正在保存...") : t("Saved", "已保存")}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={closeSettings}
                className="rounded-md px-2 py-1 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
              >
                {t("Close", "关闭")}
              </button>
            </div>

            <div className="h-[calc(100%-56px)] overflow-y-auto px-5 py-4">{renderSection(activeTab)}</div>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default SettingsPanel;
