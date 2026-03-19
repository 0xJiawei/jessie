import { Download, FileUp, Pin, PinOff, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "../common/ConfirmDialog";
import { useMemoryStore } from "../../store/useMemoryStore";
import { useChatStore } from "../../store/useChatStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import SettingCard from "./SettingCard";
import SettingToggle from "./SettingToggle";
import type { SectionFeedbackHandlers } from "./types";

const formatTime = (timestamp: number) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);

function MemorySection({ onSaved, onMessage }: SectionFeedbackHandlers) {
  const memoryEnabled = useSettingsStore((state) => state.memoryEnabled);
  const models = useSettingsStore((state) => state.models);
  const apiKey = useSettingsStore((state) => state.apiKey);
  const setMemoryEnabled = useSettingsStore((state) => state.setMemoryEnabled);

  const selectedModel = useChatStore((state) => state.selectedModel);

  const profilePreferences = useMemoryStore((state) => state.profile.preferences);
  const memoryItems = useMemoryStore((state) => state.items);
  const isImportingMemory = useMemoryStore((state) => state.isImporting);
  const setProfilePreferences = useMemoryStore((state) => state.setProfilePreferences);
  const removeMemoryItem = useMemoryStore((state) => state.removeMemoryItem);
  const togglePinMemoryItem = useMemoryStore((state) => state.togglePinMemoryItem);
  const addMemoryItems = useMemoryStore((state) => state.addMemoryItems);
  const importMemory = useMemoryStore((state) => state.importMemory);

  const [importText, setImportText] = useState("");
  const [deleteMemoryId, setDeleteMemoryId] = useState<string | null>(null);
  const [preferencesDraft, setPreferencesDraft] = useState(profilePreferences);
  const saveTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const saveProfilePreferences = (nextValue: string) => {
    const current = useMemoryStore.getState().profile.preferences;
    if (nextValue === current) {
      return;
    }

    setProfilePreferences(nextValue);
    onSaved();
  };

  useEffect(() => {
    setPreferencesDraft(profilePreferences);
  }, [profilePreferences]);

  useEffect(() => {
    if (preferencesDraft === profilePreferences) {
      return;
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveProfilePreferences(preferencesDraft);
      saveTimerRef.current = null;
    }, 700);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [preferencesDraft, profilePreferences]);

  const modelForImport = useMemo(() => {
    return selectedModel.trim() || models.find((item) => item.id.trim().length > 0)?.id.trim() || "";
  }, [selectedModel, models]);

  const sortedMemoryItems = useMemo(() => {
    return [...memoryItems].sort((a, b) => {
      if (Boolean(b.pinned) !== Boolean(a.pinned)) {
        return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      }
      return b.createdAt - a.createdAt;
    });
  }, [memoryItems]);

  const onImport = async () => {
    const result = await importMemory(importText, {
      apiKey: apiKey.trim() ? apiKey : undefined,
      model: modelForImport || undefined,
    });

    if (result.error) {
      onMessage(result.error, true);
      return;
    }

    if (result.added === 0) {
      onMessage("No new memories were imported.", true);
      return;
    }

    setImportText("");
    onSaved();
    onMessage(`Imported ${result.added} memory item${result.added > 1 ? "s" : ""}.`, false);
  };

  const onImportJsonFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;

      if (!Array.isArray(parsed)) {
        onMessage("Invalid JSON format", true);
        return;
      }

      const entries = parsed.map((entry) => {
        if (!entry || typeof entry !== "object") {
          throw new Error("invalid");
        }

        const content = (entry as { content?: unknown }).content;
        if (typeof content !== "string" || content.trim().length === 0) {
          throw new Error("invalid");
        }

        const timestamp = (entry as { timestamp?: unknown }).timestamp;
        if (timestamp !== undefined && typeof timestamp !== "number") {
          throw new Error("invalid");
        }

        return {
          content,
          source: "imported" as const,
          createdAt: typeof timestamp === "number" ? timestamp : undefined,
        };
      });

      const added = addMemoryItems(entries);
      if (added === 0) {
        onMessage("No new memories were imported.", true);
        return;
      }

      onSaved();
      onMessage("Memory import success", false);
    } catch {
      onMessage("Invalid JSON format", true);
    }
  };

  const onExport = () => {
    const payload = {
      profile: {
        preferences: profilePreferences,
      },
      items: memoryItems,
      exportedAt: Date.now(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jessie-memory-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);

    onMessage("Memory exported successfully.", false);
  };

  return (
    <div className="space-y-4">
      <SettingCard title="Memory" description="Personalize Jessie with long-term context.">
        <SettingToggle
          label="Enable Memory"
          description="Allow Jessie to read and write local memory"
          checked={memoryEnabled}
          onChange={(value) => {
            setMemoryEnabled(value);
            onSaved();
          }}
        />
      </SettingCard>

      <SettingCard title="Profile Preferences" description="What should Jessie know about you?">
        <textarea
          value={preferencesDraft}
          onChange={(event) => setPreferencesDraft(event.target.value)}
          onBlur={() => {
            if (saveTimerRef.current !== null) {
              window.clearTimeout(saveTimerRef.current);
              saveTimerRef.current = null;
            }
            saveProfilePreferences(preferencesDraft);
          }}
          rows={4}
          placeholder="I prefer concise answers, focus on product quality, and mostly use TypeScript."
          className="w-full resize-none rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
        />
      </SettingCard>

      <SettingCard
        title="Memory List"
        description="Pinned items are prioritized for future responses."
        action={
          <button
            type="button"
            onClick={onExport}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-2.5 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
          >
            <Download size={13} />
            Export all
          </button>
        }
      >
        {sortedMemoryItems.length > 0 ? (
          <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
            {sortedMemoryItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] p-2.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                    <span>{formatTime(item.createdAt)}</span>
                    <span>•</span>
                    <span className="uppercase">{item.source ?? "manual"}</span>
                    {item.pinned && (
                      <>
                        <span>•</span>
                        <span className="text-amber-300">Pinned</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        togglePinMemoryItem(item.id);
                        onSaved();
                      }}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[var(--surface-bg)] hover:text-[var(--text-primary)]"
                      aria-label={item.pinned ? "Unpin memory" : "Pin memory"}
                    >
                      {item.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteMemoryId(item.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-red-500/10 hover:text-red-300"
                      aria-label="Delete memory"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <p className="text-sm leading-6 text-[var(--text-primary)]">{item.content}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[var(--text-secondary)]">No memory items yet.</p>
        )}
      </SettingCard>

      <SettingCard
        title="Import Memory"
        description="Support JSON array or plain text. Plain text will be converted by LLM."
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            void onImportJsonFile(file);
            event.target.value = "";
          }}
        />

        <p className="mb-2 text-xs text-[var(--text-secondary)]">
          Upload a JSON file containing memory entries
        </p>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mb-2 inline-flex h-8 items-center gap-1 rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-2.5 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
        >
          <FileUp size={13} />
          Upload JSON
        </button>

        <textarea
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          rows={5}
          placeholder='[{"content":"User prefers concise answers"}] or plain text notes'
          className="w-full resize-none rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            disabled={isImportingMemory}
            onClick={() => {
              void onImport();
            }}
            className="inline-flex h-8 items-center rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isImportingMemory ? "Importing..." : "Import"}
          </button>
          <span className="text-xs text-[var(--text-secondary)]">Model for conversion: {modelForImport || "N/A"}</span>
        </div>
      </SettingCard>

      <ConfirmDialog
        open={deleteMemoryId !== null}
        title="Are you sure?"
        description="This memory item will be deleted."
        onCancel={() => setDeleteMemoryId(null)}
        onConfirm={() => {
          if (!deleteMemoryId) {
            return;
          }

          removeMemoryItem(deleteMemoryId);
          setDeleteMemoryId(null);
          onSaved();
        }}
      />
    </div>
  );
}

export default MemorySection;
