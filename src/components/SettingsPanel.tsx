import { useEffect, useMemo } from "react";
import { useSettingsStore, type SettingsTab } from "../store/useSettingsStore";
import { useToastStore } from "../store/useToastStore";
import AdvancedSection from "./settings/AdvancedSection";
import AppearanceSection from "./settings/AppearanceSection";
import DataSection from "./settings/DataSection";
import GeneralSection from "./settings/GeneralSection";
import MemorySection from "./settings/MemorySection";
import ModelsSection from "./settings/ModelsSection";
import SettingsSidebar from "./settings/SettingsSidebar";

function SettingsPanel() {
  const isSettingsOpen = useSettingsStore((state) => state.isSettingsOpen);
  const activeTab = useSettingsStore((state) => state.settingsTab);
  const setActiveTab = useSettingsStore((state) => state.setSettingsTab);
  const closeSettings = useSettingsStore((state) => state.closeSettings);
  const pushToast = useToastStore((state) => state.pushToast);

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

  const showSavedToast = () => {
    pushToast("Saved successfully", "success");
  };

  const showMessage = (message: string, isError = false) => {
    pushToast(message, isError ? "error" : "success");
  };

  const sectionProps = {
    onSaved: showSavedToast,
    onMessage: showMessage,
  };

  const renderSection = (tab: SettingsTab) => {
    switch (tab) {
      case "general":
        return <GeneralSection {...sectionProps} />;
      case "models":
        return <ModelsSection {...sectionProps} />;
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
        aria-label="Close settings"
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
              <p className="text-sm font-semibold text-[var(--text-primary)]">Jessie Settings</p>
              <button
                type="button"
                onClick={closeSettings}
                className="rounded-md px-2 py-1 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
              >
                Close
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
