import { Lightbulb, Paperclip, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTr } from "../lib/i18n";
import { modelSupportsImageInput } from "../lib/openrouter";
import {
  useChatStore,
  type UploadedImageFile,
  type UploadedTextFile,
} from "../store/useChatStore";
import { useSettingsStore } from "../store/useSettingsStore";
import ModelSelector from "./ModelSelector";

const MAX_TEXT_FILE_SIZE = 120 * 1024;
const MAX_IMAGE_FILE_SIZE = 2 * 1024 * 1024;

const toBase64DataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Failed to read image file."));
    };
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });

function InputBar() {
  const { t } = useTr();
  const sendMessage = useChatStore((state) => state.sendMessage);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);
  const isStreaming = useChatStore((state) => state.isStreaming);

  const models = useSettingsStore((state) => state.models);
  const apiKey = useSettingsStore((state) => state.apiKey);
  const defaultModelId = useSettingsStore((state) => state.defaultModelId);
  const reasoningEnabled = useSettingsStore((state) => state.reasoningEnabled);
  const fileUploadEnabled = useSettingsStore((state) => state.fileUploadEnabled);
  const imageInputEnabled = useSettingsStore((state) => state.imageInputEnabled);
  const setReasoningEnabled = useSettingsStore((state) => state.setReasoningEnabled);

  const [value, setValue] = useState("");
  const [textFiles, setTextFiles] = useState<UploadedTextFile[]>([]);
  const [imageFiles, setImageFiles] = useState<UploadedImageFile[]>([]);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const configuredModels = useMemo(
    () => models.map((model) => model.id.trim()).filter((modelId) => modelId.length > 0),
    [models]
  );

  const hasModelSelected = configuredModels.includes(selectedModel);
  const hasMessagePayload = value.trim().length > 0 || textFiles.length > 0 || imageFiles.length > 0;
  const imageSupport = selectedModel ? modelSupportsImageInput(selectedModel) : false;

  const canSend = useMemo(
    () => hasMessagePayload && !isStreaming && hasModelSelected,
    [hasMessagePayload, isStreaming, hasModelSelected]
  );

  const statusHint = useMemo(() => {
    if (configuredModels.length === 0) {
      return t("No models configured", "暂无可用模型");
    }
    if (!hasModelSelected) {
      return t("Select a model", "请选择模型");
    }
    if (imageFiles.length > 0 && !imageSupport) {
      return t("Selected model may not support images", "当前模型可能不支持图片输入");
    }
    if (!fileUploadEnabled && (textFiles.length > 0 || imageFiles.length > 0)) {
      return t("File upload is currently disabled", "当前文件上传功能已禁用");
    }
    if (!apiKey.trim()) {
      return t("Add API key in Settings", "请先在设置中填写 API Key");
    }
    return t(
      "Enter to send, Shift+Enter for newline (Web search auto when needed)",
      "回车发送，Shift+回车换行（需要时会自动联网搜索）"
    );
  }, [
    t,
    configuredModels.length,
    hasModelSelected,
    imageFiles.length,
    imageSupport,
    fileUploadEnabled,
    textFiles.length,
    apiKey,
  ]);

  useEffect(() => {
    if (!selectedModel && defaultModelId.trim() && configuredModels.includes(defaultModelId.trim())) {
      setSelectedModel(defaultModelId.trim());
      return;
    }

    if (!selectedModel) {
      return;
    }

    if (!configuredModels.includes(selectedModel)) {
      setSelectedModel("");
    }
  }, [configuredModels, selectedModel, defaultModelId, setSelectedModel]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }

    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
  }, [value]);

  useEffect(() => {
    if (!uploadNotice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setUploadNotice(null);
    }, 2400);

    return () => window.clearTimeout(timeout);
  }, [uploadNotice]);

  const onUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    const nextTextFiles: UploadedTextFile[] = [];
    const nextImageFiles: UploadedImageFile[] = [];
    const warnings: string[] = [];

    for (const file of Array.from(files)) {
      const lowerName = file.name.toLowerCase();
      const isTextFile = lowerName.endsWith(".txt") || lowerName.endsWith(".md");
      const isImageFile = file.type.startsWith("image/");

      if (isTextFile) {
        if (file.size > MAX_TEXT_FILE_SIZE) {
          warnings.push(
            t(
              "{name} exceeds text file size limit.",
              "{name} 超出文本文件大小限制。",
              { name: file.name }
            )
          );
          continue;
        }

        const content = await file.text();
        nextTextFiles.push({ name: file.name, content });
        continue;
      }

      if (isImageFile) {
        if (!imageInputEnabled) {
          warnings.push(t("Image input is currently disabled.", "当前图片输入功能已禁用。"));
          continue;
        }

        if (file.size > MAX_IMAGE_FILE_SIZE) {
          warnings.push(
            t("{name} exceeds image size limit.", "{name} 超出图片大小限制。", {
              name: file.name,
            })
          );
          continue;
        }

        const dataUrl = await toBase64DataUrl(file);
        nextImageFiles.push({
          name: file.name,
          mimeType: file.type || "image/png",
          dataUrl,
        });
        continue;
      }

      warnings.push(
        t("{name} is not a supported file type.", "{name} 不是支持的文件类型。", {
          name: file.name,
        })
      );
    }

    if (nextTextFiles.length > 0) {
      setTextFiles((current) => [...current, ...nextTextFiles]);
    }
    if (nextImageFiles.length > 0) {
      setImageFiles((current) => [...current, ...nextImageFiles]);
    }

    if (warnings.length > 0) {
      setUploadNotice(warnings[0]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!canSend) {
      return;
    }

    const content = value;
    const currentTextFiles = textFiles;
    const currentImageFiles = imageFiles;

    setValue("");
    setTextFiles([]);
    setImageFiles([]);

    await sendMessage(content, {
      textFiles: currentTextFiles,
      imageFiles: currentImageFiles,
      reasoningEnabled,
    });
  };

  return (
    <section className="relative z-10 border-t border-[color:var(--border)] bg-[var(--panel-bg)] px-4 py-3 backdrop-blur-xl md:px-6">
      <div className="mx-auto w-full max-w-[1040px]">
        <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--surface-bg)] px-3 py-2.5 shadow-panel">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              const isCmdEnter = event.key === "Enter" && event.metaKey;
              const isPlainEnter = event.key === "Enter" && !event.shiftKey && !event.metaKey;

              if (isCmdEnter || isPlainEnter) {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            rows={1}
            placeholder={
              apiKey
                ? t("Ask anything about your code...", "输入你的问题...")
                : t(
                    "Add OpenRouter API key in Settings before sending.",
                    "发送前请先在设置中填写 OpenRouter API Key。"
                  )
            }
            className="max-h-[220px] min-h-[32px] w-full resize-none border-none bg-transparent px-1 py-1 text-[15px] leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]"
          />

          {(textFiles.length > 0 || imageFiles.length > 0 || uploadNotice) && (
            <div className="mt-2 space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                {textFiles.map((file, index) => (
                  <div
                    key={`text-${file.name}-${index}`}
                    className="inline-flex items-center gap-1 rounded-md border border-[color:var(--border)] bg-[var(--surface-muted)] px-2 py-1 text-xs"
                  >
                    <span className="max-w-[180px] truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setTextFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
                      }}
                      className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                      aria-label={t("Remove {name}", "移除 {name}", { name: file.name })}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}

                {imageFiles.map((file, index) => (
                  <div
                    key={`image-${file.name}-${index}`}
                    className="inline-flex items-center gap-1 rounded-md border border-[color:var(--border)] bg-[var(--surface-muted)] px-2 py-1 text-xs"
                  >
                    <span className="max-w-[180px] truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setImageFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
                      }}
                      className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                      aria-label={t("Remove {name}", "移除 {name}", { name: file.name })}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>

              {uploadNotice && <p className="text-xs text-amber-300">{uploadNotice}</p>}
            </div>
          )}

          <div className="mt-2 flex items-center gap-2 border-t border-[color:var(--border)] pt-2.5">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={imageInputEnabled ? ".txt,.md,image/*" : ".txt,.md"}
              multiple
              onChange={(event) => {
                void onUploadFiles(event.target.files);
              }}
            />

            {fileUploadEnabled && (
              <button
                type="button"
                aria-label={t("Upload files", "上传文件")}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)] transition hover:bg-[var(--surface-bg)] hover:text-[var(--text-primary)]"
              >
                <Paperclip size={14} />
              </button>
            )}

            <button
              type="button"
              onClick={() => setReasoningEnabled(!reasoningEnabled)}
              className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition ${
                reasoningEnabled
                  ? "border-[color:var(--focus)] bg-[var(--message-user)] text-[var(--text-primary)]"
                  : "border-[color:var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Lightbulb size={13} />
              {t("Reasoning", "推理")}
            </button>

            <ModelSelector value={selectedModel} onChange={setSelectedModel} className="ml-1 w-56 shrink-0" />

            <button
              type="button"
              onClick={() => {
                void handleSubmit();
              }}
              disabled={!canSend}
              className="ml-auto h-8 rounded-lg border border-[color:var(--border)] bg-[var(--message-user)] px-3.5 text-sm font-medium text-[var(--text-primary)] shadow-sm transition hover:-translate-y-px hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
            >
              {isStreaming ? t("Streaming...", "生成中...") : t("Send", "发送")}
            </button>
          </div>

          <p className="mt-2 text-xs text-[var(--text-secondary)]">{statusHint}</p>
        </div>
      </div>
    </section>
  );
}

export default InputBar;
