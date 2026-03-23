import { useMemo } from "react";
import { useTr } from "../lib/i18n";
import { useSettingsStore } from "../store/useSettingsStore";

interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

function ModelSelector({ value, onChange, className = "", disabled = false }: ModelSelectorProps) {
  const { t } = useTr();
  const models = useSettingsStore((state) => state.models);

  const configuredModels = useMemo(
    () => models.filter((model) => model.id.trim().length > 0),
    [models]
  );

  const hasModels = configuredModels.length > 0;
  const hasSelectedValue = configuredModels.some((model) => model.id === value);

  return (
    <div className={`relative ${className}`}>
      <select
        value={hasSelectedValue ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={!hasModels || disabled}
        className="h-8 w-full appearance-none rounded-lg border border-[color:var(--border)] bg-[var(--surface-bg)] px-3 pr-8 text-sm text-[var(--text-primary)] outline-none transition hover:border-[color:var(--text-secondary)] focus:border-[color:var(--focus)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="" disabled>
          {hasModels ? t("Select model", "选择模型") : t("No models configured", "暂无可用模型")}
        </option>
        {configuredModels.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name.trim() || model.id}
          </option>
        ))}
      </select>

      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[var(--text-secondary)]">
        v
      </span>
    </div>
  );
}

export default ModelSelector;
