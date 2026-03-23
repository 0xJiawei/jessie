import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createChatCompletionText,
  createChatCompletionWithTools,
  modelLikelySupportsToolCalling,
  modelLikelySupportsReasoning,
  modelSupportsImageInput,
  OpenRouterError,
  streamChatCompletion,
  type ChatCompletionRequestMessage,
  type OpenRouterToolCall,
  type OpenRouterToolDefinition,
} from "../lib/openrouter";
import {
  createAppError,
  isAppError,
  mapOpenRouterError,
  mapUnknownError,
  type AppError,
} from "../lib/appError";
import { DEBUG } from "../lib/debug";
import { safeSetLocalStorage } from "../lib/localPersistence";
import { searchWebWithTavily } from "../lib/tavily";
import type { ChatAppView, ChatMessage, Conversation } from "../types/chat";
import { useMcpStore } from "./useMcpStore";
import { useMemoryStore } from "./useMemoryStore";
import { useSettingsStore } from "./useSettingsStore";
import { useToastStore } from "./useToastStore";

export interface UploadedTextFile {
  name: string;
  content: string;
}

export interface UploadedImageFile {
  name: string;
  mimeType: string;
  dataUrl: string;
}

export interface SendMessageOptions {
  textFiles?: UploadedTextFile[];
  imageFiles?: UploadedImageFile[];
  reasoningEnabled?: boolean;
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  selectedModel: string;
  isStreaming: boolean;
  error: string | null;
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  setActiveConversation: (id: string) => void;
  setSelectedModel: (model: string) => void;
  clearError: () => void;
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
}

type MemoryInjection = ReturnType<ReturnType<typeof useMemoryStore.getState>["buildMemoryInjection"]>;

const UNTITLED_NAME = "New Chat";
const NO_RESPONSE_TEXT = "No response received from model. Please try again.";
const REALTIME_QUERY_PATTERN =
  /\b(today|tomorrow|now|current|latest|recent|news|weather|forecast|price|stock|live|update)\b|今天|明天|现在|最新|实时|天气|预报|新闻|股价|价格|汇率/i;

const WEB_SEARCH_TOOL: OpenRouterToolDefinition = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web for real-time information",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

interface UnifiedToolRuntime {
  definition: OpenRouterToolDefinition;
  source: "builtin" | "mcp";
  execute: (args: unknown) => Promise<{ result: unknown; appView?: ChatAppView }>;
}

const getConfiguredModelIds = () =>
  useSettingsStore
    .getState()
    .models.map((model) => model.id.trim())
    .filter((id) => id.length > 0);

const getDefaultModelId = () => useSettingsStore.getState().defaultModelId.trim();

const getValidDefaultModelId = () => {
  const defaultModel = getDefaultModelId();
  return getConfiguredModelIds().includes(defaultModel) ? defaultModel : "";
};

const createId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createConversationRecord = (model: string): Conversation => {
  const now = Date.now();
  return {
    id: createId(),
    title: UNTITLED_NAME,
    model,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
};

const buildTitle = (source: string) => {
  const plain = source.replace(/\s+/g, " ").trim();
  if (!plain) {
    return UNTITLED_NAME;
  }

  const words = plain.split(" ").filter(Boolean);
  if (words.length <= 8) {
    return words.join(" ");
  }

  return `${words.slice(0, 7).join(" ")}...`;
};

const sanitizeGeneratedTitle = (title: string) => {
  const compact = title
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!compact) {
    return "";
  }

  const words = compact.split(" ").filter(Boolean);
  if (words.length <= 5) {
    return compact;
  }

  return words.slice(0, 5).join(" ");
};

const parseToolArguments = (toolCall: OpenRouterToolCall) => {
  if (!toolCall.function?.arguments) {
    return {};
  }

  try {
    const parsed = JSON.parse(toolCall.function.arguments) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Tool arguments must be a JSON object.");
    }
    return parsed;
  } catch (error) {
    throw createAppError({
      code: "TOOL_CALL_PARSE_FAILED",
      source: "tool",
      message: error instanceof Error ? error.message : "Failed to parse tool arguments.",
      retryable: true,
      userMessage: "工具调用参数解析失败，请重试。",
      debugContext: {
        toolCall,
      },
    });
  }
};

const generateChatTitle = async ({
  apiKey,
  model,
  firstUserMessage,
}: {
  apiKey: string;
  model: string;
  firstUserMessage: string;
}) => {
  const text = firstUserMessage.trim();
  if (!text) {
    return "";
  }

  try {
    const generated = await createChatCompletionText({
      apiKey,
      model,
      messages: [
        {
          role: "system",
          content: "Summarize this conversation in 5 words or less",
        },
        {
          role: "user",
          content: text.slice(0, 1800),
        },
      ],
      temperature: 0,
      maxTokens: 24,
    });

    return sanitizeGeneratedTitle(generated);
  } catch {
    return "";
  }
};

const buildTextFileContext = (textFiles: UploadedTextFile[]) => {
  if (textFiles.length === 0) {
    return "";
  }

  return textFiles
    .map((file) => `Here is a file (${file.name}):\n${file.content}`)
    .join("\n\n");
};

const initialConversation = createConversationRecord(getValidDefaultModelId());

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [initialConversation],
      activeConversationId: initialConversation.id,
      selectedModel: getValidDefaultModelId(),
      isStreaming: false,
      error: null,

      createConversation: () => {
        const model = get().selectedModel.trim() || getValidDefaultModelId();
        const conversation = createConversationRecord(model);
        const settingsState = useSettingsStore.getState();
        settingsState.setReasoningEnabled(settingsState.autoReasoning);

        set((state) => ({
          conversations: [conversation, ...state.conversations],
          activeConversationId: conversation.id,
          error: null,
        }));

        return conversation.id;
      },

      deleteConversation: (id) => {
        set((state) => {
          const remaining = state.conversations.filter((conversation) => conversation.id !== id);
          if (remaining.length === state.conversations.length) {
            return state;
          }

          const deletingActive = state.activeConversationId === id;
          const nextActive = deletingActive ? (remaining[0]?.id ?? null) : state.activeConversationId;
          const nextSelectedModel = deletingActive
            ? (remaining[0]?.model || getValidDefaultModelId())
            : state.selectedModel;

          return {
            conversations: remaining,
            activeConversationId: nextActive,
            selectedModel: nextSelectedModel,
            error: null,
          };
        });
      },

      setActiveConversation: (id) => {
        set((state) => {
          const conversation = state.conversations.find((entry) => entry.id === id);
          if (!conversation) {
            return state;
          }

          return {
            activeConversationId: id,
            selectedModel: conversation.model || getValidDefaultModelId(),
            error: null,
          };
        });
      },

      setSelectedModel: (model) => set({ selectedModel: model }),

      clearError: () => set({ error: null }),

      sendMessage: async (rawContent, options) => {
        const content = rawContent.trim();
        const textFiles = options?.textFiles ?? [];
        const imageFiles = options?.imageFiles ?? [];

        const hasInput = content.length > 0 || textFiles.length > 0 || imageFiles.length > 0;
        if (!hasInput || get().isStreaming) {
          return;
        }

        const settings = useSettingsStore.getState();
        const setPreflightError = (appError: AppError) => {
          console.error("[Jessie][Error][Preflight]", appError);
          set({ error: appError.userMessage });
        };

        if (!settings.apiKey) {
          settings.openSettings();
          setPreflightError(
            createAppError({
              code: "MISSING_API_KEY",
              source: "config",
              message: "OpenRouter API key is missing.",
              retryable: false,
              userMessage: "请先在设置里填写 OpenRouter API Key。",
            })
          );
          return;
        }

        const model = get().selectedModel.trim() || getValidDefaultModelId();
        if (!model) {
          setPreflightError(
            createAppError({
              code: "MISSING_MODEL",
              source: "config",
              message: "No model selected.",
              retryable: false,
              userMessage: "请先选择一个模型再发送消息。",
            })
          );
          return;
        }

        const configuredModelIds = getConfiguredModelIds();
        if (configuredModelIds.length === 0) {
          settings.openSettings();
          setPreflightError(
            createAppError({
              code: "INVALID_MODEL",
              source: "config",
              message: "No models configured.",
              retryable: false,
              userMessage: "当前没有可用模型，请先在设置中添加模型。",
            })
          );
          return;
        }

        if (!configuredModelIds.includes(model)) {
          setPreflightError(
            createAppError({
              code: "INVALID_MODEL",
              source: "config",
              message: "Selected model is not configured.",
              retryable: false,
              userMessage: "当前选择的模型不可用，请重新选择模型。",
            })
          );
          return;
        }

        if (imageFiles.length > 0 && !settings.imageInputEnabled) {
          setPreflightError(
            createAppError({
              code: "IMAGE_INPUT_DISABLED",
              source: "config",
              message: "Image input is disabled.",
              retryable: false,
              userMessage: "图片输入已禁用，请在设置中启用后重试。",
            })
          );
          return;
        }

        if (imageFiles.length > 0 && !modelSupportsImageInput(model)) {
          setPreflightError(
            createAppError({
              code: "MODEL_NO_IMAGE_SUPPORT",
              source: "config",
              message: "Selected model does not support image input.",
              retryable: false,
              userMessage: "当前模型不支持图片输入，请更换支持图片的模型。",
            })
          );
          return;
        }

        let conversationId = get().activeConversationId;
        if (!conversationId) {
          conversationId = get().createConversation();
        }

        const state = get();
        const conversation = state.conversations.find((item) => item.id === conversationId);
        if (!conversation) {
          return;
        }

        const requestStartedAt = Date.now();
        console.log("[Jessie][Request][Start]", {
          conversationId,
          model,
        });

        const textFileContext = buildTextFileContext(textFiles);
        const promptText = [content, textFileContext].filter((item) => item.length > 0).join("\n\n");
        const imageNotes = imageFiles.map((file) => `[Image attached: ${file.name}]`).join("\n");
        const userVisibleContent = [
          promptText || "[Image-only message]",
          imageNotes.length > 0 ? imageNotes : "",
        ]
          .filter((item) => item.length > 0)
          .join("\n\n");

        const userMessage: ChatMessage = {
          id: createId(),
          role: "user",
          content: userVisibleContent,
          createdAt: Date.now(),
        };

        const assistantMessage: ChatMessage = {
          id: createId(),
          role: "assistant",
          content: "",
          createdAt: Date.now(),
        };

        const memoryInput = promptText || content || userVisibleContent;
        let memoryInjection: MemoryInjection | null = null;
        if (settings.memoryEnabled) {
          try {
            memoryInjection = await useMemoryStore.getState().buildMemoryInjectionWithCompression({
              userInput: memoryInput,
              apiKey: settings.apiKey,
              model,
            });
          } catch (error) {
            const appError = mapUnknownError(error, {
              code: "MEMORY_EXTRACTION_FAILED",
              source: "memory",
              retryable: true,
              userMessage: "记忆读取失败，本次将继续但不使用记忆。",
              debugContext: {
                stage: "memory_injection",
              },
            });
            console.error("[Jessie][Memory][Injection][Error]", appError);
            memoryInjection = null;
          }
        }

        const systemMessages: ChatCompletionRequestMessage[] = [];
        if (memoryInjection && memoryInjection.systemPrompt.trim().length > 0) {
          systemMessages.push({
            role: "system",
            content: memoryInjection.systemPrompt,
          });
        }

        if (options?.reasoningEnabled) {
          systemMessages.push({
            role: "system",
            content:
              "Reasoning mode is enabled. Think step by step internally, then provide a concise and clear final response.",
          });
        }

        const historyMessages: ChatCompletionRequestMessage[] = conversation.messages.map((message) => ({
          role: message.role,
          content: message.content,
        }));

        const textUserPrompt = memoryInjection?.userPrompt || promptText || userVisibleContent;
        const currentUserContent: ChatCompletionRequestMessage["content"] =
          imageFiles.length > 0
            ? [
                {
                  type: "text",
                  text: textUserPrompt || "Please analyze the attached image.",
                },
                ...imageFiles.map((file) => ({
                  type: "image_url" as const,
                  image_url: { url: file.dataUrl },
                })),
              ]
            : textUserPrompt;

        const reasoningEnabledForModel = Boolean(
          options?.reasoningEnabled && modelLikelySupportsReasoning(model)
        );
        const modelSupportsToolCalling = modelLikelySupportsToolCalling(model);
        const shouldPreferWebSearch = REALTIME_QUERY_PATTERN.test(textUserPrompt || "");
        const tavilyApiKey = settings.tavilyApiKey.trim();
        const mcpStore = useMcpStore.getState();
        const toolRegistry = new Map<string, UnifiedToolRuntime>();

        if (tavilyApiKey) {
          toolRegistry.set(WEB_SEARCH_TOOL.function.name, {
            definition: WEB_SEARCH_TOOL,
            source: "builtin",
            execute: async (args) => {
              const query =
                args && typeof args === "object" && !Array.isArray(args) && "query" in args
                  ? String((args as { query?: unknown }).query ?? "").trim()
                  : "";

              if (!query) {
                throw createAppError({
                  code: "TOOL_CALL_PARSE_FAILED",
                  source: "tool",
                  message: "Failed to parse web_search query from tool arguments.",
                  retryable: true,
                  userMessage: "Web search 请求解析失败，请重试。",
                });
              }

              console.log("Tool called:", query);
              const result = await searchWebWithTavily({
                apiKey: tavilyApiKey,
                query,
              });
              console.log("Tavily result:", result);
              return { result };
            },
          });
        }

        for (const mcpTool of mcpStore.getOpenRouterTools()) {
          const toolName = mcpTool.function.name.trim();
          if (!toolName || toolRegistry.has(toolName)) {
            continue;
          }

          toolRegistry.set(toolName, {
            definition: mcpTool,
            source: "mcp",
            execute: (args) =>
              mcpStore.executeToolCall({
                openRouterName: toolName,
                arguments: args,
                timeoutMs: 15_000,
              }),
          });
        }

        const requestedTools = Array.from(toolRegistry.keys());

        console.log({
          model,
          tools: requestedTools,
          reasoning_enabled: reasoningEnabledForModel,
          tool_calling_supported: modelSupportsToolCalling,
        });

        const requestMessages: ChatCompletionRequestMessage[] = [
          ...systemMessages,
          ...historyMessages,
          {
            role: "user",
            content: currentUserContent,
          },
        ];

        let finalRequestMessages = requestMessages;
        let webSearchTriggered = false;
        let webSearchFallbackReason = "";
        let pendingAppView: ChatAppView | undefined;
        let preStreamError: AppError | null = null;
        try {
          if (requestedTools.length > 0 && modelSupportsToolCalling) {
            const maxToolRounds = 3;
            let toolLoopMessages = requestMessages;
            let toolChoiceForRound: "auto" | "required" =
              shouldPreferWebSearch && toolRegistry.has(WEB_SEARCH_TOOL.function.name)
                ? "required"
                : "auto";

            for (let round = 0; round < maxToolRounds; round += 1) {
              const toolProbe = await createChatCompletionWithTools({
                apiKey: settings.apiKey,
                model,
                messages: toolLoopMessages,
                tools: Array.from(toolRegistry.values()).map((tool) => tool.definition),
                toolChoice: toolChoiceForRound,
                temperature: 0,
                maxTokens: 260,
                reasoningEnabled: reasoningEnabledForModel,
              });

              if (toolProbe.toolCalls.length === 0) {
                break;
              }

              const toolResultMessages: ChatCompletionRequestMessage[] = [];
              for (const toolCall of toolProbe.toolCalls) {
                const toolName = toolCall.function?.name?.trim() || "";
                const matchedTool = toolRegistry.get(toolName);
                if (!matchedTool) {
                  preStreamError = createAppError({
                    code: "MODEL_MALFORMED_RESPONSE",
                    source: "tool",
                    message: `Model requested unknown tool: ${toolName || "(empty)"}`,
                    retryable: true,
                    userMessage: "模型请求了未知工具，请重试或更换模型。",
                    debugContext: {
                      toolCall,
                    },
                  });
                  break;
                }

                if (toolName === WEB_SEARCH_TOOL.function.name) {
                  webSearchTriggered = true;
                }

                let parsedArgs: unknown = {};
                try {
                  parsedArgs = parseToolArguments(toolCall);
                } catch (error) {
                  preStreamError = isAppError(error)
                    ? error
                    : mapUnknownError(error, {
                        code: "TOOL_CALL_PARSE_FAILED",
                        source: "tool",
                        retryable: true,
                        userMessage: "工具调用参数解析失败，请重试。",
                        debugContext: {
                          toolName,
                        },
                      });
                  break;
                }

                console.log("[Jessie][Tools][Called]", {
                  tool: toolName,
                  source: matchedTool.source,
                });

                try {
                  const toolExecution = await matchedTool.execute(parsedArgs);
                  console.log("[Jessie][Tools][Result]", {
                    tool: toolName,
                    source: matchedTool.source,
                  });
                  if (toolExecution.appView && !pendingAppView) {
                    pendingAppView = toolExecution.appView;
                  }
                  toolResultMessages.push({
                    role: "tool",
                    tool_call_id: toolCall.id || createId(),
                    name: toolName,
                    content: JSON.stringify(toolExecution.result ?? {}),
                  });
                } catch (error) {
                  const userMessage =
                    matchedTool.source === "builtin"
                      ? "Web search unavailable：联网搜索失败，请稍后重试。"
                      : "MCP 工具调用失败，请检查服务器状态后重试。";

                  preStreamError = isAppError(error)
                    ? error
                    : mapUnknownError(error, {
                        code: "TOOL_EXECUTION_FAILED",
                        source: "tool",
                        retryable: true,
                        userMessage,
                        debugContext: {
                          tool: toolName,
                          source: matchedTool.source,
                        },
                      });
                  break;
                }
              }

              if (preStreamError || toolResultMessages.length === 0) {
                break;
              }

              const assistantToolMessage: ChatCompletionRequestMessage = {
                role: "assistant",
                content: toolProbe.text || "",
                tool_calls: toolProbe.toolCalls,
              };

              toolLoopMessages = [...toolLoopMessages, assistantToolMessage, ...toolResultMessages];
              finalRequestMessages = toolLoopMessages;
              toolChoiceForRound = "auto";
            }

            if (
              shouldPreferWebSearch &&
              toolRegistry.has(WEB_SEARCH_TOOL.function.name) &&
              !webSearchTriggered &&
              !preStreamError
            ) {
              preStreamError = createAppError({
                code: "TOOL_EXECUTION_FAILED",
                source: "tool",
                message: "Model did not invoke web_search tool for a real-time query.",
                retryable: true,
                userMessage: "当前模型未触发联网搜索工具，请更换支持工具调用的模型后重试。",
                debugContext: {
                  model,
                  prompt: textUserPrompt,
                },
              });
            }
          } else if (shouldPreferWebSearch && !tavilyApiKey) {
            webSearchFallbackReason = "missing_tavily_api_key";
            useToastStore.getState().pushToast("Web search unavailable：请先在设置中填写 Tavily API Key。", "error");
          } else if (shouldPreferWebSearch && !modelSupportsToolCalling) {
            webSearchFallbackReason = "model_no_tool_support";
            useToastStore.getState().pushToast("当前模型可能不支持工具调用，将直接使用模型回答。", "info");
          }
        } catch (error) {
          preStreamError =
            isAppError(error)
              ? error
              : mapUnknownError(error, {
                  code: "TOOL_EXECUTION_FAILED",
                  source: "tool",
                  retryable: true,
                  userMessage: "Web search unavailable：工具调用失败，请重试。",
                  debugContext: {
                    model,
                  },
                });
          webSearchFallbackReason = preStreamError.message || "tool_loop_failed";
        }

        console.log("[Jessie][Tools][WebSearch]", {
          preferred: shouldPreferWebSearch,
          triggered: webSearchTriggered,
          fallback: webSearchFallbackReason || undefined,
        });

        if (preStreamError) {
          console.error("[Jessie][Error][PreStream]", preStreamError);
          useToastStore.getState().pushToast(preStreamError.userMessage, "error");

          set((current) => ({
            error: preStreamError.userMessage,
            isStreaming: false,
            conversations: current.conversations.map((item) => {
              if (item.id !== conversationId) {
                return item;
              }

              return {
                ...item,
                model,
                updatedAt: Date.now(),
                messages: [
                  ...item.messages,
                  userMessage,
                  {
                    ...assistantMessage,
                    content: preStreamError.userMessage,
                  },
                ],
              };
            }),
          }));

          const persistenceError = safeSetLocalStorage(
            "jessie:last_error",
            JSON.stringify({
              code: preStreamError.code,
              source: preStreamError.source,
              at: Date.now(),
            })
          );
          if (persistenceError) {
            console.error("[Jessie][Persistence][Error]", persistenceError);
          }
          return;
        }

        if (DEBUG || settings.debugMode) {
          console.debug(
            "[Jessie][Memory][Retrieved]",
            memoryInjection?.usedMemories.map((memory) => ({
              id: memory.id,
              content: memory.content,
              type: memory.type,
              weight: memory.weight,
            })) ?? []
          );
          console.debug("[Jessie][Prompt][Injected]", {
            systemPrompt: memoryInjection?.systemPrompt ?? "",
            userPrompt: memoryInjection?.userPrompt ?? memoryInput,
          });
        }

        const isFirstUserTurn = conversation.messages.filter((message) => message.role === "user").length === 0;
        const fallbackTitle = buildTitle(promptText || content || userVisibleContent);
        const shouldGenerateTitleByLlm = conversation.title === UNTITLED_NAME && isFirstUserTurn;

        set((current) => ({
          conversations: current.conversations.map((item) => {
            if (item.id !== conversationId) {
              return item;
            }

            return {
              ...item,
              model,
              title: shouldGenerateTitleByLlm ? fallbackTitle : item.title,
              updatedAt: Date.now(),
              messages: [
                ...item.messages,
                userMessage,
                {
                  ...assistantMessage,
                  appView: pendingAppView,
                },
              ],
            };
          }),
          error: null,
          isStreaming: true,
        }));

        if (shouldGenerateTitleByLlm) {
          void (async () => {
            const generatedTitle = await generateChatTitle({
              apiKey: settings.apiKey,
              model,
              firstUserMessage: textUserPrompt || content || userVisibleContent,
            });
            const nextTitle = generatedTitle || fallbackTitle || UNTITLED_NAME;

            set((current) => ({
              conversations: current.conversations.map((item) => {
                if (item.id !== conversationId) {
                  return item;
                }

                if (item.title !== fallbackTitle && item.title !== UNTITLED_NAME) {
                  return item;
                }

                return {
                  ...item,
                  title: nextTitle,
                };
              }),
            }));
          })();
        }

        try {
          await streamChatCompletion({
            apiKey: settings.apiKey,
            model,
            messages: finalRequestMessages,
            temperature: settings.modelTemperature,
            maxTokens: settings.modelMaxTokens ?? undefined,
            reasoningEnabled: reasoningEnabledForModel,
            onToken: (token) => {
              set((current) => ({
                conversations: current.conversations.map((item) => {
                  if (item.id !== conversationId) {
                    return item;
                  }

                  return {
                    ...item,
                    updatedAt: Date.now(),
                    messages: item.messages.map((message) => {
                      if (message.id !== assistantMessage.id) {
                        return message;
                      }

                      return {
                        ...message,
                        content: `${message.content}${token}`,
                      };
                    }),
                  };
                }),
              }));
            },
          });

          set((current) => ({
            conversations: current.conversations.map((item) => {
              if (item.id !== conversationId) {
                return item;
              }

              return {
                ...item,
                messages: item.messages.map((message) => {
                  if (message.id !== assistantMessage.id || message.content.trim().length > 0) {
                    return message;
                  }

                  return {
                    ...message,
                    content: NO_RESPONSE_TEXT,
                  };
                }),
              };
            }),
          }));

          const latestAssistantMessage = get()
            .conversations.find((item) => item.id === conversationId)
            ?.messages.find((message) => message.id === assistantMessage.id);

          console.log("[Jessie][API][Response]", {
            model,
            hasContent: Boolean(latestAssistantMessage?.content.trim().length),
            length: latestAssistantMessage?.content.length ?? 0,
            durationMs: Date.now() - requestStartedAt,
          });

          const successPersistError = safeSetLocalStorage(
            "jessie:last_success",
            JSON.stringify({
              model,
              at: Date.now(),
              conversationId,
            })
          );
          if (successPersistError) {
            console.error("[Jessie][Persistence][Error]", successPersistError);
          }

          const latestConversation = get().conversations.find((item) => item.id === conversationId);
          if (latestConversation && settings.memoryEnabled) {
            try {
              useMemoryStore
                .getState()
                .touchMemoryUsage(memoryInjection?.usedMemories.map((memory) => memory.id) ?? []);

              void useMemoryStore.getState().extractMemory({
                apiKey: settings.apiKey,
                model,
                conversationMessages: latestConversation.messages,
              });
            } catch (error) {
              const memoryError = mapUnknownError(error, {
                code: "MEMORY_EXTRACTION_FAILED",
                source: "memory",
                retryable: true,
                userMessage: "记忆提取失败，本次回复不受影响。",
                debugContext: {
                  stage: "post_response_memory",
                },
              });
              console.error("[Jessie][Memory][PostResponse][Error]", memoryError);
            }

            if (DEBUG || settings.debugMode) {
              const assistantResponse =
                latestConversation.messages
                  .slice()
                  .reverse()
                  .find((message) => message.id === assistantMessage.id)?.content || "";
              console.debug("[Jessie][Response]", {
                input: memoryInput,
                response: assistantResponse,
              });
            }
          }
        } catch (error) {
          const appError =
            error instanceof OpenRouterError
              ? mapOpenRouterError(error, { model, conversationId })
              : isAppError(error)
                ? error
                : mapUnknownError(error, {
                    code: "UNKNOWN",
                    source: "unknown",
                    retryable: true,
                    userMessage: "请求失败，请重试。",
                    debugContext: {
                      model,
                      conversationId,
                    },
                  });

          console.error("[Jessie][API][Error]", appError);

          useToastStore.getState().pushToast(appError.userMessage, "error");

          set((current) => ({
            error: appError.userMessage,
            conversations: current.conversations.map((item) => {
              if (item.id !== conversationId) {
                return item;
              }

              return {
                ...item,
                updatedAt: Date.now(),
                messages: item.messages.map((entry) => {
                  if (entry.id !== assistantMessage.id || entry.content.trim().length > 0) {
                    return entry;
                  }

                  return {
                    ...entry,
                    content: appError.userMessage,
                  };
                }),
              };
            }),
          }));

          const persistError = safeSetLocalStorage(
            "jessie:last_error",
            JSON.stringify({
              code: appError.code,
              source: appError.source,
              at: Date.now(),
            })
          );
          if (persistError) {
            console.error("[Jessie][Persistence][Error]", persistError);
          }
        } finally {
          set({ isStreaming: false });
        }
      },
    }),
    {
      name: "jessie-chat",
      partialize: (state) => ({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
        selectedModel: state.selectedModel,
      }),
      merge: (persistedState, currentState) => {
        const merged = {
          ...currentState,
          ...(persistedState as Partial<ChatState>),
        };

        const conversations = Array.isArray(merged.conversations) ? merged.conversations : [];

        const configuredModels = getConfiguredModelIds();
        const selectedModel =
          typeof merged.selectedModel === "string" && configuredModels.includes(merged.selectedModel)
            ? merged.selectedModel
            : getValidDefaultModelId();

        if (conversations.length === 0) {
          return {
            ...merged,
            conversations,
            activeConversationId: null,
            selectedModel,
          };
        }

        const hasActive = conversations.some((conversation) => conversation.id === merged.activeConversationId);

        if (!merged.activeConversationId || !hasActive) {
          return {
            ...merged,
            conversations,
            activeConversationId: conversations[0].id,
            selectedModel,
          };
        }

        return {
          ...merged,
          conversations,
          selectedModel,
        };
      },
    }
  )
);
