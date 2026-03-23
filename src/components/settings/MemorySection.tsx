import { Download, FileUp, Pin, PinOff, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTr } from "../../lib/i18n";
import ConfirmDialog from "../common/ConfirmDialog";
import { useMemoryStore } from "../../store/useMemoryStore";
import { useChatStore } from "../../store/useChatStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import SettingCard from "./SettingCard";
import SettingToggle from "./SettingToggle";
import type { SectionFeedbackHandlers } from "./types";

const formatTime = (timestamp: number, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);

function MemorySection({ onSaved, onMessage }: SectionFeedbackHandlers) {
  const { t, locale } = useTr();
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
      onMessage(t("No new memories were imported.", "没有可导入的新记忆。"), true);
      return;
    }

    setImportText("");
    onSaved();
    onMessage(
      t("Imported {count} memory items.", "已导入 {count} 条记忆。", { count: result.added }),
      false
    );
  };

  const onImportJsonFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text.replace(/^\uFEFF/, "")) as unknown;

      let profilePreferencesFromFile = "";
      let entriesSource: unknown = parsed;

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const objectParsed = parsed as {
          profile?: { preferences?: unknown };
          items?: unknown;
          memories?: unknown;
          memoryItems?: unknown;
          data?: unknown;
        };

        if (typeof objectParsed.profile?.preferences === "string") {
          profilePreferencesFromFile = objectParsed.profile.preferences;
        }

        entriesSource =
          objectParsed.items ??
          objectParsed.memories ??
          objectParsed.memoryItems ??
          objectParsed.data ??
          parsed;
      }

      if (!Array.isArray(entriesSource)) {
        onMessage(
          t(
            "Invalid JSON format: expected an array or { items: [] }.",
            "JSON 格式无效：需要数组或 { items: [] }。"
          ),
          true
        );
        return;
      }

      const entries = entriesSource.map((entry) => {
        if (!entry || typeof entry !== "object") {
          throw new Error("invalid");
        }

        const content =
          (entry as { content?: unknown }).content ??
          (entry as { conversations_memory?: unknown }).conversations_memory ??
          (entry as { memory?: unknown }).memory ??
          (entry as { text?: unknown }).text;
        if (typeof content !== "string" || content.trim().length === 0) {
          throw new Error("invalid");
        }

        const rawTimestamp =
          (entry as { timestamp?: unknown }).timestamp ??
          (entry as { createdAt?: unknown }).createdAt;
        const timestamp =
          typeof rawTimestamp === "number"
            ? rawTimestamp
            : typeof rawTimestamp === "string"
              ? Number(rawTimestamp)
              : undefined;
        if (timestamp !== undefined && !Number.isFinite(timestamp)) {
          throw new Error("invalid");
        }

        return {
          content,
          type:
            typeof (entry as { type?: unknown }).type === "string"
              ? ((entry as { type?: "preference" | "fact" | "context" }).type ?? undefined)
              : undefined,
          source: "imported" as const,
          pinned: Boolean((entry as { pinned?: unknown }).pinned),
          createdAt: typeof timestamp === "number" ? timestamp : undefined,
          updatedAt:
            typeof (entry as { updatedAt?: unknown }).updatedAt === "number"
              ? Number((entry as { updatedAt: number }).updatedAt)
              : undefined,
          weight:
            typeof (entry as { weight?: unknown }).weight === "number"
              ? Number((entry as { weight: number }).weight)
              : undefined,
        };
      });

      const added = addMemoryItems(entries);
      const trimmedPreferences = profilePreferencesFromFile.trim();
      const shouldApplyProfile = trimmedPreferences.length > 0 && trimmedPreferences !== profilePreferences;
      if (shouldApplyProfile) {
        setProfilePreferences(trimmedPreferences);
      }

      if (added === 0 && !shouldApplyProfile) {
        onMessage(t("No new memories were imported.", "没有可导入的新记忆。"), true);
        return;
      }

      onSaved();
      if (added > 0 && shouldApplyProfile) {
        onMessage(
          t(
            "Memory import success: {count} items + profile preferences restored.",
            "记忆导入成功：{count} 条，并恢复了个人偏好。",
            { count: added }
          ),
          false
        );
      } else if (added > 0) {
        onMessage(
          t("Memory import success: {count} items.", "记忆导入成功：{count} 条。", { count: added }),
          false
        );
      } else {
        onMessage(t("Profile preferences restored from file.", "已从文件恢复个人偏好。"), false);
      }
    } catch {
      onMessage(t("Invalid JSON format", "JSON 格式无效"), true);
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

    onMessage(t("Memory exported successfully.", "记忆导出成功。"), false);
  };

  return (
    <div className="space-y-4">
      <SettingCard
        title={t("Memory", "记忆")}
        description={t("Personalize Jessie with long-term context.", "用长期上下文个性化 Jessie。")}
      >
        <SettingToggle
          label={t("Enable Memory", "启用记忆")}
          description={t("Allow Jessie to read and write local memory", "允许 Jessie 读写本地记忆")}
          checked={memoryEnabled}
          onChange={(value) => {
            setMemoryEnabled(value);
            onSaved();
          }}
        />
      </SettingCard>

      <SettingCard
        title={t("Profile Preferences", "个人偏好")}
        description={t("What should Jessie know about you?", "你希望 Jessie 记住什么？")}
      >
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
          placeholder={t(
            "I prefer concise answers, focus on product quality, and mostly use TypeScript.",
            "我偏好简洁回答，关注产品质量，主要使用 TypeScript。"
          )}
          className="w-full resize-none rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
        />
      </SettingCard>

      <SettingCard
        title={t("Memory List", "记忆列表")}
        description={t("Pinned items are prioritized for future responses.", "置顶记忆会在后续回复中优先使用。")}
        action={
          <button
            type="button"
            onClick={onExport}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-2.5 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
          >
            <Download size={13} />
            {t("Export all", "导出全部")}
          </button>
        }
      >
        {sortedMemoryItems.length > 0 ? (
          <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
            {sortedMemoryItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] p-2.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                    <span>{formatTime(item.createdAt, locale)}</span>
                    <span>•</span>
                    <span className="uppercase">{item.source ?? t("manual", "手动")}</span>
                    {item.pinned && (
                      <>
                        <span>•</span>
                        <span className="text-amber-300">{t("Pinned", "已置顶")}</span>
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
                      aria-label={item.pinned ? t("Unpin memory", "取消置顶") : t("Pin memory", "置顶记忆")}
                    >
                      {item.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteMemoryId(item.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-red-500/10 hover:text-red-300"
                      aria-label={t("Delete memory", "删除记忆")}
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
          <p className="text-xs text-[var(--text-secondary)]">{t("No memory items yet.", "暂时没有记忆。")}</p>
        )}
      </SettingCard>

      <SettingCard
        title={t("Import Memory", "导入记忆")}
        description={t(
          "Support JSON array or plain text. Plain text will be converted by LLM.",
          "支持 JSON 数组或纯文本。纯文本会由 LLM 转换。"
        )}
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
          {t("Upload a JSON file containing memory entries", "上传包含记忆条目的 JSON 文件")}
        </p>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mb-2 inline-flex h-8 items-center gap-1 rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-2.5 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
        >
          <FileUp size={13} />
          {t("Upload JSON", "上传 JSON")}
        </button>

        <textarea
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          rows={5}
          placeholder={t(
            '[{"content":"User prefers concise answers"}] or plain text notes',
            '[{"content":"用户偏好简洁回答"}] 或纯文本笔记'
          )}
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
            {isImportingMemory ? t("Importing...", "导入中...") : t("Import", "导入")}
          </button>
          <span className="text-xs text-[var(--text-secondary)]">
            {t("Model for conversion: {model}", "用于转换的模型：{model}", {
              model: modelForImport || t("N/A", "无"),
            })}
          </span>
        </div>
      </SettingCard>

      <ConfirmDialog
        open={deleteMemoryId !== null}
        title={t("Are you sure?", "确定吗？")}
        description={t("This memory item will be deleted.", "该记忆条目将被删除。")}
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
