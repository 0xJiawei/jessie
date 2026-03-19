import { ChevronDown, CircleHelp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../common/ConfirmDialog";
import { useChatStore } from "../../store/useChatStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import SettingCard from "./SettingCard";
import Tooltip from "./Tooltip";
import type { SectionFeedbackHandlers } from "./types";

function ModelsSection({ onSaved, onMessage }: SectionFeedbackHandlers) {
  const apiKey = useSettingsStore((state) => state.apiKey);
  const models = useSettingsStore((state) => state.models);
  const defaultModelId = useSettingsStore((state) => state.defaultModelId);
  const modelTemperature = useSettingsStore((state) => state.modelTemperature);
  const modelMaxTokens = useSettingsStore((state) => state.modelMaxTokens);

  const setApiKey = useSettingsStore((state) => state.setApiKey);
  const setDefaultModelId = useSettingsStore((state) => state.setDefaultModelId);
  const setModelTemperature = useSettingsStore((state) => state.setModelTemperature);
  const setModelMaxTokens = useSettingsStore((state) => state.setModelMaxTokens);
  const addModel = useSettingsStore((state) => state.addModel);
  const updateModel = useSettingsStore((state) => state.updateModel);
  const removeModel = useSettingsStore((state) => state.removeModel);

  const selectedModel = useChatStore((state) => state.selectedModel);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);

  const configuredModels = useMemo(
    () => models.filter((model) => model.id.trim().length > 0),
    [models]
  );

  const [expandedIndexes, setExpandedIndexes] = useState<number[]>([]);
  const [maxTokensInput, setMaxTokensInput] = useState<string>(
    modelMaxTokens === null ? "" : String(modelMaxTokens)
  );
  const [deleteModelIndex, setDeleteModelIndex] = useState<number | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    setMaxTokensInput(modelMaxTokens === null ? "" : String(modelMaxTokens));
  }, [modelMaxTokens]);

  const toggleExpanded = (index: number) => {
    setExpandedIndexes((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index]
    );
  };

  return (
    <div className="space-y-4">
      <SettingCard title="OpenRouter API Key" description="Required for model requests. Stored locally on this device.">
        <div className="relative">
          <input
            type={showApiKey ? "text" : "password"}
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              onSaved();
            }}
            placeholder="sk-or-v1-..."
            className="h-10 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 pr-10 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[color:var(--focus)]"
          />

          <button
            type="button"
            onClick={() => setShowApiKey((current) => !current)}
            className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[var(--surface-bg)] hover:text-[var(--text-primary)]"
            aria-label={showApiKey ? "Hide API key" : "Show API key"}
          >
            {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        {!apiKey.trim() && (
          <p className="mt-2 text-xs text-amber-300">Add your OpenRouter API key to start chatting.</p>
        )}
      </SettingCard>

      <SettingCard title="Provider" description="Current model provider configuration.">
        <div className="rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]">
          OpenRouter
        </div>
      </SettingCard>

      <SettingCard title="Default Model" description="Used when opening a new chat.">
        <select
          value={defaultModelId}
          onChange={(event) => {
            setDefaultModelId(event.target.value);
            if (!selectedModel.trim()) {
              setSelectedModel(event.target.value);
            }
            onSaved();
          }}
          className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
        >
          <option value="">No default model</option>
          {configuredModels.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name.trim() || model.id}
            </option>
          ))}
        </select>
      </SettingCard>

      <SettingCard title="Model Parameters" description="Optional defaults for every request.">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              Temperature
              <Tooltip content="Controls randomness. Lower values = more deterministic. Higher values = more creative.">
                <CircleHelp size={13} className="text-[var(--text-secondary)]" />
              </Tooltip>
            </span>
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={modelTemperature}
              onChange={(event) => {
                setModelTemperature(Number(event.target.value));
                onSaved();
              }}
              className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
            />
          </label>

          <label className="space-y-1.5">
            <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              Max tokens
              <Tooltip content="Maximum length of the model's response. Higher values allow longer outputs but cost more.">
                <CircleHelp size={13} className="text-[var(--text-secondary)]" />
              </Tooltip>
            </span>
            <input
              type="number"
              min={256}
              step={128}
              value={maxTokensInput}
              placeholder="Unlimited"
              onChange={(event) => {
                const nextValue = event.target.value;
                setMaxTokensInput(nextValue);

                if (nextValue.trim().length === 0) {
                  setModelMaxTokens(null);
                  onSaved();
                  return;
                }

                const parsed = Number(nextValue);
                if (Number.isFinite(parsed)) {
                  setModelMaxTokens(parsed);
                  onSaved();
                }
              }}
              onBlur={() => {
                if (maxTokensInput.trim().length === 0) {
                  setModelMaxTokens(null);
                  setMaxTokensInput("");
                  onSaved();
                  return;
                }

                const parsed = Number(maxTokensInput);
                if (Number.isFinite(parsed)) {
                  setModelMaxTokens(parsed);
                  setMaxTokensInput(String(Math.max(256, Math.round(parsed))));
                } else {
                  setModelMaxTokens(null);
                  setMaxTokensInput("");
                }
                onSaved();
              }}
              className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
            />
          </label>
        </div>
      </SettingCard>

      <SettingCard
        title="Model List"
        description="Manage model IDs and display names."
        action={
          <button
            type="button"
            onClick={() => {
              addModel();
              onSaved();
              onMessage("Model added successfully", false);
            }}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-2.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
          >
            <Plus size={14} />
            Add model
          </button>
        }
      >
        {models.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)]">No models configured yet.</p>
        ) : (
          <div className="space-y-2">
            {models.map((model, index) => {
              const isExpanded = expandedIndexes.includes(index);
              const title = model.name.trim() || model.id.trim() || `Model ${index + 1}`;

              return (
                <div key={index} className="rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)]">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(index)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left"
                  >
                    <div>
                      <p className="text-sm text-[var(--text-primary)]">{title}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {model.id.trim() || "ID not set"}
                      </p>
                    </div>
                    <ChevronDown
                      size={15}
                      className={`text-[var(--text-secondary)] transition-transform ${
                        isExpanded ? "rotate-180" : "rotate-0"
                      }`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="space-y-2 border-t border-[color:var(--border)] px-3 py-2">
                      <input
                        value={model.name}
                        onChange={(event) => {
                          updateModel(index, { name: event.target.value });
                          onSaved();
                        }}
                        placeholder="Display name"
                        className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-bg)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
                      />

                      <input
                        value={model.id}
                        onChange={(event) => {
                          const nextId = event.target.value;
                          const currentId = model.id;
                          updateModel(index, { id: nextId });

                          if (defaultModelId === currentId) {
                            setDefaultModelId(nextId.trim());
                          }
                          if (selectedModel === currentId) {
                            setSelectedModel(nextId.trim());
                          }
                          onSaved();
                        }}
                        placeholder="Model ID"
                        className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-bg)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
                      />

                      <button
                        type="button"
                        onClick={() => setDeleteModelIndex(index)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-400/30 px-2.5 text-xs text-red-300 transition hover:bg-red-500/10"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SettingCard>

      <ConfirmDialog
        open={deleteModelIndex !== null}
        title="Are you sure?"
        description="This model configuration will be deleted."
        onCancel={() => setDeleteModelIndex(null)}
        onConfirm={() => {
          if (deleteModelIndex === null) {
            return;
          }

          const model = models[deleteModelIndex];
          if (!model) {
            setDeleteModelIndex(null);
            return;
          }

          removeModel(deleteModelIndex);
          if (defaultModelId === model.id) {
            setDefaultModelId("");
          }
          if (selectedModel === model.id) {
            setSelectedModel("");
          }
          setDeleteModelIndex(null);
          onSaved();
        }}
      />
    </div>
  );
}

export default ModelsSection;
