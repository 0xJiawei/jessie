import { useEffect, useState } from "react";
import { useTr } from "../../lib/i18n";
import { useSettingsStore } from "../../store/useSettingsStore";
import SettingCard from "./SettingCard";
import SettingToggle from "./SettingToggle";
import type { SectionFeedbackHandlers } from "./types";

function GeneralSection({ onSaved }: SectionFeedbackHandlers) {
  const { t } = useTr();
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
      <SettingCard
        title={t("Language", "语言")}
        description={t("Language used in Jessie interface.", "Jessie 界面的显示语言。")}
      >
        <select
          value={language}
          onChange={(event) => {
            setLanguage(event.target.value);
            onSaved();
          }}
          className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
        >
          <option value="English">English</option>
          <option value="简体中文">简体中文</option>
        </select>
      </SettingCard>

      <SettingCard
        title={t("Tavily API Key", "Tavily API Key")}
        description={t("Used for real-time web search tool calls.", "用于联网搜索工具调用。")}
      >
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

      <SettingCard
        title={t("Default Behaviors", "默认行为")}
        description={t("Applied when starting new conversations.", "新对话默认应用。")}
      >
        <div className="space-y-2">
          <SettingToggle
            label={t("Auto Reasoning", "默认启用推理")}
            description={t(
              "Enable OpenRouter reasoning.enabled by default (supported models only)",
              "默认开启 OpenRouter reasoning.enabled（仅对支持模型生效）"
            )}
            checked={autoReasoning}
            onChange={(value) => {
              setAutoReasoning(value);
              onSaved();
            }}
          />
        </div>
      </SettingCard>

      <SettingCard
        title={t("Keyboard Shortcuts", "快捷键")}
        description={t("Customizable shortcuts coming soon.", "可自定义快捷键即将上线。")}
      >
        <div className="rounded-lg border border-dashed border-[color:var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          {t(
            "Placeholder: `Cmd+K` quick switch, `Cmd+,` open settings.",
            "占位：`Cmd+K` 快速切换，`Cmd+,` 打开设置。"
          )}
        </div>
      </SettingCard>
    </div>
  );
}

export default GeneralSection;

