import SettingCard from "./SettingCard";
import SettingToggle from "./SettingToggle";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { SectionFeedbackHandlers } from "./types";

function AdvancedSection({ onSaved, onMessage }: SectionFeedbackHandlers) {
  const debugMode = useSettingsStore((state) => state.debugMode);
  const experimentalFeatures = useSettingsStore((state) => state.experimentalFeatures);
  const setDebugMode = useSettingsStore((state) => state.setDebugMode);
  const setExperimentalFeatures = useSettingsStore((state) => state.setExperimentalFeatures);

  return (
    <div className="space-y-4">
      <SettingCard title="Debug" description="Developer and diagnostics switches.">
        <div className="space-y-2">
          <SettingToggle
            label="Debug Mode"
            description="Enable verbose diagnostics"
            checked={debugMode}
            onChange={(value) => {
              setDebugMode(value);
              onSaved();
            }}
          />
          <button
            type="button"
            onClick={() => {
              onMessage("Open DevTools from Tauri window menu for detailed logs.", false);
            }}
            className="inline-flex h-8 items-center rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
          >
            Show logs
          </button>
        </div>
      </SettingCard>

      <SettingCard title="Experimental" description="Early features that may change.">
        <SettingToggle
          label="Experimental Features"
          description="Enable preview functionality"
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
