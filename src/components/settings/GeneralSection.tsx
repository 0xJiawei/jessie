import { useEffect, useState } from "react";
import SettingCard from "./SettingCard";
import SettingToggle from "./SettingToggle";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { SectionFeedbackHandlers } from "./types";

function GeneralSection({ onSaved }: SectionFeedbackHandlers) {
  const language = useSettingsStore((state) => state.language);
  const tavilyApiKey = useSettingsStore((state) => state.tavilyApiKey);
  const autoReasoning = useSettingsStore((state) => state.autoReasoning);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const setTavilyApiKey = useSettingsStore((state) => state.setTavilyApiKey);
  const setAutoReasoning = useSettingsStore((state) => state.setAutoReasoning);
  const [tavilyDraft, setTavilyDraft] = useState(tavilyApiKey);

  useEffect(() => {
    setTavilyDraft(tavilyApiKey);
  }, [tavilyApiKey]);

  return (
    <div className="space-y-4">
      <SettingCard title="Language" description="Language used in Jessie interface.">
        <select
          value={language}
          onChange={(event) => {
            // TODO: Language switch does not trigger UI re-render.
            // Fix before v1 release (likely needs i18n state refresh or app reload)
            setLanguage(event.target.value);
            onSaved();
          }}
          className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
        >
          <option value="English">English</option>
          <option value="简体中文">简体中文</option>
        </select>
      </SettingCard>

      <SettingCard title="Tavily API Key" description="Used for real-time web search tool calls.">
        <input
          type="password"
          value={tavilyDraft}
          onChange={(event) => setTavilyDraft(event.target.value)}
          onBlur={() => {
            if (tavilyDraft === tavilyApiKey) {
              return;
            }
            setTavilyApiKey(tavilyDraft.trim());
            onSaved();
          }}
          placeholder="tvly-..."
          className="h-10 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[color:var(--focus)]"
        />
      </SettingCard>

      <SettingCard title="Default Behaviors" description="Applied when starting new conversations.">
        <div className="space-y-2">
          <SettingToggle
            label="Auto Reasoning"
            description="Enable reasoning mode by default"
            checked={autoReasoning}
            onChange={(value) => {
              setAutoReasoning(value);
              onSaved();
            }}
          />
        </div>
      </SettingCard>

      <SettingCard title="Keyboard Shortcuts" description="Customizable shortcuts coming soon.">
        <div className="rounded-lg border border-dashed border-[color:var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          Placeholder: `Cmd+K` quick switch, `Cmd+,` open settings.
        </div>
      </SettingCard>
    </div>
  );
}

export default GeneralSection;
