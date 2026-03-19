import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createChatCompletionText,
  createChatCompletionWithTools,
  modelLikelySupportsReasoning,
  modelLikelySupportsToolCalling,
  modelSupportsImageInput,
  OpenRouterError,
  streamChatCompletion,
  type ChatCompletionRequestMessage,
  type OpenRouterToolCall,
  type OpenRouterToolDefinition,
} from "../lib/openrouter";
import { DEBUG } from "../lib/debug";
import { formatWebSearchContext, searchWeb } from "../lib/webSearch";
import type { ChatMessage, Conversation } from "../types/chat";
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
  webSearchEnabled?: boolean;
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

const UNTITLED_NAME = "New Chat";
const NO_RESPONSE_TEXT = "No response received from model. Please try again.";

const WEB_SEARCH_TOOL: OpenRouterToolDefinition = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web for up-to-date information when needed.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query keywords",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

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

const parseWebSearchQuery = (toolCall?: OpenRouterToolCall) => {
  if (!toolCall?.function?.arguments) {
    return "";
  }

  try {
    const parsed = JSON.parse(toolCall.function.arguments) as { query?: unknown };
    return typeof parsed.query === "string" ? parsed.query.trim() : "";
  } catch {
    return "";
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
        if (!settings.apiKey) {
          settings.openSettings();
          set({ error: "Please add your OpenRouter API key in Settings first." });
          return;
        }

        const model = get().selectedModel.trim() || getValidDefaultModelId();
        if (!model) {
          set({ error: "Select a model before sending." });
          return;
        }

        const configuredModelIds = getConfiguredModelIds();
        if (configuredModelIds.length === 0) {
          settings.openSettings();
          set({ error: "No models configured. Add one in Settings first." });
          return;
        }

        if (!configuredModelIds.includes(model)) {
          set({ error: "The selected model is no longer available. Please choose another one." });
          return;
        }

        if (imageFiles.length > 0 && !settings.imageInputEnabled) {
          set({ error: "Image input is disabled in settings." });
          return;
        }

        if (imageFiles.length > 0 && !modelSupportsImageInput(model)) {
          set({ error: "The selected model does not support image input." });
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
        const memoryInjection = settings.memoryEnabled
          ? useMemoryStore.getState().buildMemoryInjection(memoryInput)
          : null;

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
        const webSearchRequested = Boolean(options?.webSearchEnabled);
        const webSearchSupportedByModel = modelLikelySupportsToolCalling(model);
        const canUseWebSearchTool = webSearchRequested && webSearchSupportedByModel;
        const requestedTools = canUseWebSearchTool ? [WEB_SEARCH_TOOL.function.name] : [];

        console.log({
          model,
          tools: requestedTools,
          reasoning_enabled: reasoningEnabledForModel,
        });

        let webSearchTriggered = false;
        let webSearchQuery = "";
        let webSearchResultCount = 0;
        let webSearchFallbackReason = "";

        if (webSearchRequested && !webSearchSupportedByModel) {
          webSearchFallbackReason = "model_no_tool_support";
        } else if (canUseWebSearchTool) {
          try {
            const toolProbe = await createChatCompletionWithTools({
              apiKey: settings.apiKey,
              model,
              messages: [
                ...systemMessages,
                ...historyMessages,
                {
                  role: "user",
                  content: textUserPrompt || content || userVisibleContent,
                },
              ],
              tools: [WEB_SEARCH_TOOL],
              toolChoice: "auto",
              temperature: 0,
              maxTokens: 160,
              reasoningEnabled: reasoningEnabledForModel,
            });

            const matchedToolCall = toolProbe.toolCalls.find(
              (toolCall) => toolCall.function?.name === WEB_SEARCH_TOOL.function.name
            );

            if (matchedToolCall) {
              webSearchTriggered = true;
              webSearchQuery =
                parseWebSearchQuery(matchedToolCall) ||
                (textUserPrompt || content || userVisibleContent).slice(0, 220);
              const searchResults = await searchWeb(webSearchQuery);
              webSearchResultCount = searchResults.length;

              systemMessages.push({
                role: "system",
                content: "Web search mode is enabled. Use the following results when relevant.",
              });
              systemMessages.push({
                role: "system",
                content: `Here are relevant search results:\n\n${formatWebSearchContext(searchResults)}`,
              });
            }
          } catch (error) {
            webSearchFallbackReason = error instanceof Error ? error.message : "tool_probe_failed";
          }
        }

        console.log("[Jessie][Tools][WebSearch]", {
          requested: webSearchRequested,
          supported: webSearchSupportedByModel,
          triggered: webSearchTriggered,
          query: webSearchQuery,
          resultCount: webSearchResultCount,
          fallback: webSearchFallbackReason || undefined,
        });

        const requestMessages: ChatCompletionRequestMessage[] = [
          ...systemMessages,
          ...historyMessages,
          {
            role: "user",
            content: currentUserContent,
          },
        ];

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
              messages: [...item.messages, userMessage, assistantMessage],
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
            messages: requestMessages,
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
          });

          const latestConversation = get().conversations.find((item) => item.id === conversationId);
          if (latestConversation && settings.memoryEnabled) {
            useMemoryStore
              .getState()
              .touchMemoryUsage(memoryInjection?.usedMemories.map((memory) => memory.id) ?? []);

            void useMemoryStore.getState().extractMemory({
              apiKey: settings.apiKey,
              model,
              conversationMessages: latestConversation.messages,
            });

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
          const message =
            error instanceof OpenRouterError
              ? error.userMessage || error.message
              : error instanceof Error
                ? error.message
                : "Unexpected request error.";

          console.log("[Jessie][API][Error]", {
            model,
            message,
          });

          useToastStore.getState().pushToast(message, "error");

          set((current) => ({
            error: message,
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
                    content: message,
                  };
                }),
              };
            }),
          }));
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
