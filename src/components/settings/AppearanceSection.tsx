import SettingCard from "./SettingCard";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { SectionFeedbackHandlers } from "./types";

function AppearanceSection({ onSaved }: SectionFeedbackHandlers) {
  const theme = useSettingsStore((state) => state.theme);
  const fontSize = useSettingsStore((state) => state.fontSize);
  const uiScale = useSettingsStore((state) => state.uiScale);

  const setTheme = useSettingsStore((state) => state.setTheme);
  const setFontSize = useSettingsStore((state) => state.setFontSize);
  const setUiScale = useSettingsStore((state) => state.setUiScale);

  return (
    <div className="space-y-4">
      <SettingCard title="Theme" description="Choose light, dark, or system mode.">
        <div className="grid gap-2 sm:grid-cols-3">
          {(["light", "dark", "system"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setTheme(option);
                onSaved();
              }}
              className={`h-9 rounded-lg border text-sm transition ${
                theme === option
                  ? "border-[color:var(--focus)] bg-[var(--message-user)] text-[var(--text-primary)]"
                  : "border-[color:var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </SettingCard>

      <SettingCard title="Font Size" description="Adjust base text size.">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={12}
            max={20}
            value={fontSize}
            onChange={(event) => {
              setFontSize(Number(event.target.value));
              onSaved();
            }}
            className="w-full"
          />
          <span className="w-10 text-right text-xs text-[var(--text-secondary)]">{fontSize}px</span>
        </div>
      </SettingCard>

      <SettingCard title="UI Scale" description="Scale the Jessie interface density.">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={85}
            max={115}
            value={uiScale}
            onChange={(event) => {
              setUiScale(Number(event.target.value));
              onSaved();
            }}
            className="w-full"
          />
          <span className="w-12 text-right text-xs text-[var(--text-secondary)]">{uiScale}%</span>
        </div>
      </SettingCard>
    </div>
  );
}

export default AppearanceSection;
