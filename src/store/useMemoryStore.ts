import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createChatCompletionText } from "../lib/openrouter";
import {
  categoryToMemoryType,
  classifyMemoryCandidate,
  isSupersedingMemory,
  shouldPersistMemoryDecision,
} from "../lib/memoryQuality";
import {
  buildPrompt,
  formatMemory,
  retrieveRelevantMemory,
} from "../lib/memoryEngine";
import type { ChatMessage } from "../types/chat";
import type { MemoryItem, MemoryType, ProfileMemory } from "../types/memory";

const MAX_MEMORY_ITEMS = 50;

interface ImportMemoryOptions {
  apiKey?: string;
  model?: string;
}

interface ExtractMemoryOptions {
  apiKey: string;
  model: string;
  conversationMessages: ChatMessage[];
}

interface ImportMemoryResult {
  added: number;
  error?: string;
}

type NewMemoryInput =
  | string
  | {
      content: string;
      type?: MemoryType;
      source?: MemoryItem["source"];
      pinned?: boolean;
      createdAt?: number;
      updatedAt?: number;
      weight?: number;
    };

interface MemoryInjectionResult {
  systemPrompt: string;
  userPrompt: string;
  usedMemories: MemoryItem[];
}

interface MemoryState {
  profile: ProfileMemory;
  items: MemoryItem[];
  isImporting: boolean;
  setProfilePreferences: (preferences: string) => void;
  removeMemoryItem: (id: string) => void;
  togglePinMemoryItem: (id: string) => void;
  touchMemoryUsage: (ids: string[]) => void;
  addMemoryItems: (entries: NewMemoryInput[]) => number;
  importMemory: (rawInput: string, options?: ImportMemoryOptions) => Promise<ImportMemoryResult>;
  extractMemory: (options: ExtractMemoryOptions) => Promise<number>;
  buildMemoryInjection: (userInput: string) => MemoryInjectionResult;
}

const createId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

const cleanMemoryContent = (value: string) => value.replace(/\s+/g, " ").trim();

const tokenize = (value: string) =>
  normalize(value)
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .filter((token) => token.length >= 2);

const determineMemoryType = (content: string): MemoryType => {
  const lower = normalize(content);
  if (
    ["prefer", "preference", "喜欢", "偏好", "usually", "always", "often"].some((keyword) =>
      lower.includes(keyword)
    )
  ) {
    return "preference";
  }

  if (
    ["i am", "i'm", "my job", "work as", "我是", "我在", "facts", "background"].some((keyword) =>
      lower.includes(keyword)
    )
  ) {
    return "fact";
  }

  return "context";
};

const similarityScore = (a: string, b: string) => {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let overlap = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) {
      overlap += 1;
    }
  });

  return overlap / Math.max(tokensA.size, tokensB.size);
};

const contradictionPairRules: Array<[string, string]> = [
  ["concise", "detailed"],
  ["short", "long"],
  ["brief", "comprehensive"],
  ["中文", "english"],
  ["light", "dark"],
];

const hasContradiction = (a: string, b: string) => {
  const lowerA = normalize(a);
  const lowerB = normalize(b);

  for (const [left, right] of contradictionPairRules) {
    const aHasLeft = lowerA.includes(left);
    const aHasRight = lowerA.includes(right);
    const bHasLeft = lowerB.includes(left);
    const bHasRight = lowerB.includes(right);

    if ((aHasLeft && bHasRight) || (aHasRight && bHasLeft)) {
      return true;
    }
  }

  return false;
};

const parseMemoryArrayLike = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as NewMemoryInput[];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item && typeof item === "object" && "content" in item) {
        const content = (item as { content?: unknown }).content;
        if (typeof content === "string") {
          return {
            content,
            type:
              typeof (item as { type?: unknown }).type === "string"
                ? ((item as { type?: MemoryType }).type ?? "context")
                : undefined,
            source:
              typeof (item as { source?: unknown }).source === "string"
                ? ((item as { source?: MemoryItem["source"] }).source ?? "imported")
                : "imported",
            pinned: Boolean((item as { pinned?: unknown }).pinned),
            createdAt:
              typeof (item as { timestamp?: unknown }).timestamp === "number"
                ? Number((item as { timestamp: number }).timestamp)
                : undefined,
          };
        }
      }

      return "" as NewMemoryInput;
    })
    .map((entry) => {
      if (typeof entry === "string") {
        return cleanMemoryContent(entry);
      }

      return {
        ...entry,
        content: cleanMemoryContent(entry.content),
      };
    })
    .filter((entry) => {
      if (typeof entry === "string") return entry.length > 0;
      return entry.content.length > 0;
    });
};

const parseMemoryListFromText = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) {
    return [] as NewMemoryInput[];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const direct = parseMemoryArrayLike(parsed);
    if (direct.length > 0) {
      return direct;
    }
  } catch {
    // no-op
  }

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      const fromSlice = parseMemoryArrayLike(parsed);
      if (fromSlice.length > 0) {
        return fromSlice;
      }
    } catch {
      // no-op
    }
  }

  return trimmed
    .split("\n")
    .map((line) => line.replace(/^[-*\d.\s]+/, ""))
    .map(cleanMemoryContent)
    .filter((line) => line.length > 0)
    .map((line) => ({ content: line, source: "imported" as const }));
};

const conversationSnippet = (messages: ChatMessage[]) =>
  messages
    .filter((message) => message.role === "user")
    .slice(-10)
    .map((message) => `${message.role.toUpperCase()}: ${message.content.slice(0, 420)}`)
    .join("\n\n");

const decayWeight = (weight: number | undefined, updatedAt: number) => {
  const base = weight ?? 0;
  const days = Math.max(0, (Date.now() - updatedAt) / (1000 * 60 * 60 * 24));
  return Math.max(0, base - Math.min(1.2, days * 0.03));
};

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      profile: {
        preferences: "",
      },
      items: [],
      isImporting: false,

      setProfilePreferences: (preferences) =>
        set({
          profile: {
            preferences,
          },
        }),

      removeMemoryItem: (id) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),

      togglePinMemoryItem: (id) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  pinned: !item.pinned,
                  updatedAt: Date.now(),
                  weight: (item.weight ?? 0) + 0.5,
                }
              : item
          ),
        })),

      touchMemoryUsage: (ids) => {
        const unique = new Set(ids);
        set((state) => ({
          items: state.items.map((item) =>
            unique.has(item.id)
              ? {
                  ...item,
                  updatedAt: Date.now(),
                  weight: Math.min(20, (item.weight ?? 0) + 1),
                }
              : {
                  ...item,
                  weight: decayWeight(item.weight, item.updatedAt),
                }
          ),
        }));
      },

      addMemoryItems: (entries) => {
        const prepared = entries
          .map((entry) => {
            if (typeof entry === "string") {
              const content = cleanMemoryContent(entry);
              return {
                content,
                type: determineMemoryType(content),
                source: "manual" as const,
                pinned: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                weight: 1,
              };
            }

            const content = cleanMemoryContent(entry.content);
            const now = Date.now();
            return {
              content,
              type: entry.type ?? determineMemoryType(content),
              source: entry.source ?? "manual",
              pinned: entry.pinned ?? false,
              createdAt: entry.createdAt ?? now,
              updatedAt: entry.updatedAt ?? now,
              weight: entry.weight ?? 1,
            };
          })
          .filter((entry) => entry.content.length > 0)
          .slice(0, 12);

        if (prepared.length === 0) {
          return 0;
        }

        let added = 0;

        set((state) => {
          const next = [...state.items];

          prepared.forEach((entry) => {
            const normalizedIncoming = normalize(entry.content);
            const similarIndex = next.findIndex(
              (item) => similarityScore(item.content, entry.content) >= 0.7
            );

            if (similarIndex !== -1) {
              const existing = next[similarIndex];
              const contradicts = hasContradiction(existing.content, entry.content);
              const supersedes = isSupersedingMemory(existing.content, entry.content);
              const stronger = entry.content.length >= existing.content.length;

              next[similarIndex] = {
                ...existing,
                content: contradicts || supersedes || stronger ? entry.content : existing.content,
                type: contradicts || supersedes ? entry.type : existing.type,
                updatedAt: Date.now(),
                source: contradicts || supersedes ? entry.source : existing.source,
                pinned: existing.pinned || entry.pinned,
                weight: Math.min(20, Math.max(existing.weight ?? 1, entry.weight) + 0.6),
              };
              return;
            }

            const exactIndex = next.findIndex((item) => normalize(item.content) === normalizedIncoming);
            if (exactIndex !== -1) {
              const existing = next[exactIndex];
              next[exactIndex] = {
                ...existing,
                updatedAt: Date.now(),
                weight: Math.min(20, (existing.weight ?? 1) + 0.4),
              };
              return;
            }

            added += 1;
            next.push({
              id: createId(),
              content: entry.content,
              type: entry.type,
              createdAt: entry.createdAt,
              updatedAt: entry.updatedAt,
              pinned: entry.pinned,
              source: entry.source,
              weight: entry.weight,
            });
          });

          const trimmed = next
            .sort((a, b) => {
              if (Boolean(b.pinned) !== Boolean(a.pinned)) {
                return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
              }
              return b.updatedAt - a.updatedAt;
            })
            .slice(0, MAX_MEMORY_ITEMS)
            .sort((a, b) => a.createdAt - b.createdAt);

          return {
            items: trimmed,
          };
        });

        return added;
      },

      importMemory: async (rawInput, options) => {
        const raw = rawInput.trim();
        if (!raw) {
          return { added: 0, error: "Please provide memory text to import." };
        }

        set({ isImporting: true });
        try {
          let parsedEntries = parseMemoryListFromText(raw);

          if (parsedEntries.length === 0) {
            if (!options?.apiKey || !options.model) {
              return {
                added: 0,
                error: "API key and model are required to convert plain text memory.",
              };
            }

            const converted = await createChatCompletionText({
              apiKey: options.apiKey,
              model: options.model,
              messages: [
                {
                  role: "system",
                  content:
                    "Convert the input into a JSON array. Each item should be {\"content\": string, \"type\": \"preference\"|\"fact\"|\"context\"}. Keep memories short and durable. Return JSON only.",
                },
                {
                  role: "user",
                  content: raw,
                },
              ],
              temperature: 0,
              maxTokens: 320,
            });

            parsedEntries = parseMemoryListFromText(converted);
          }

          if (parsedEntries.length === 0) {
            return {
              added: 0,
              error: "Could not parse any memory items from the input.",
            };
          }

          const added = get().addMemoryItems(
            parsedEntries.map((entry) =>
              typeof entry === "string" ? { content: entry, source: "imported" } : entry
            )
          );

          return { added };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to import memory.";
          return { added: 0, error: message };
        } finally {
          set({ isImporting: false });
        }
      },

      extractMemory: async ({ apiKey, model, conversationMessages }) => {
        if (conversationMessages.length === 0) {
          return 0;
        }

        try {
          const extractedText = await createChatCompletionText({
            apiKey,
            model,
            messages: [
              {
                role: "system",
                content:
                  "Extract useful long-term memory from this conversation. Return JSON array of objects with fields: content, type (preference|fact|context). Include only durable preferences/facts/context. Skip one-off tasks and temporary requests. JSON only.",
              },
              {
                role: "user",
                content: conversationSnippet(conversationMessages),
              },
            ],
            temperature: 0,
            maxTokens: 320,
          });

          const parsed = parseMemoryListFromText(extractedText).slice(0, 8);
          const candidates = parsed
            .map((entry) =>
              typeof entry === "string"
                ? {
                    content: cleanMemoryContent(entry),
                    type: determineMemoryType(entry),
                    source: "auto" as const,
                  }
                : {
                    ...entry,
                    content: cleanMemoryContent(entry.content),
                    type:
                      (entry as { type?: MemoryType }).type ?? determineMemoryType(entry.content),
                    source: "auto" as const,
                  }
            )
            .filter((entry) => entry.content.length > 0);

          const classified = candidates.map((entry) => {
            const decision = classifyMemoryCandidate({ content: entry.content });
            return {
              entry,
              decision,
            };
          });

          const accepted = classified
            .filter(({ decision }) => shouldPersistMemoryDecision(decision))
            .map(({ entry, decision }) => ({
              ...entry,
              content: decision.summary,
              type: categoryToMemoryType(decision.category),
              source: "auto" as const,
            }));

          console.log("[Jessie][Memory][Extract]", {
            candidateCount: candidates.length,
            acceptedCount: accepted.length,
            decisions: classified.map(({ entry, decision }) => ({
              original: entry.content,
              category: decision.category,
              confidence: decision.confidence,
              summary: decision.summary,
              rationale: decision.rationale,
            })),
          });

          if (accepted.length === 0) {
            return 0;
          }

          return get().addMemoryItems(accepted);
        } catch (error) {
          console.error("[Jessie][Memory][Extract][Error]", {
            message: error instanceof Error ? error.message : "unknown",
          });
          return 0;
        }
      },

      buildMemoryInjection: (userInput) => {
        const state = get();
        const relevant = retrieveRelevantMemory(userInput, state.items);

        const profilePreference = state.profile.preferences.trim();
        const memoryForPrompt = profilePreference
          ? [
              {
                id: "profile-preferences",
                content: profilePreference,
                type: "preference" as const,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                pinned: true,
                weight: 999,
                source: "manual" as const,
              },
              ...relevant,
            ]
          : relevant;

        const memoryBlock = formatMemory(memoryForPrompt);
        const prompt = buildPrompt(memoryBlock, userInput);

        return {
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          usedMemories: relevant,
        };
      },
    }),
    {
      name: "jessie-memory",
      partialize: (state) => ({
        profile: state.profile,
        items: state.items,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<MemoryState>;
        const profilePreferences =
          typeof persisted.profile?.preferences === "string" ? persisted.profile.preferences : "";

        const sourceItems = Array.isArray(persisted.items)
          ? (persisted.items as Array<Partial<MemoryItem> | null | undefined>)
          : [];

        const items = sourceItems
          .map((item) => ({
            id: typeof item?.id === "string" ? item.id : createId(),
            content: typeof item?.content === "string" ? cleanMemoryContent(item.content) : "",
            type:
              typeof item?.type === "string" && ["preference", "fact", "context"].includes(item.type)
                ? (item.type as MemoryType)
                : determineMemoryType(typeof item?.content === "string" ? item.content : ""),
            createdAt: typeof item?.createdAt === "number" ? item.createdAt : Date.now(),
            updatedAt:
              typeof item?.updatedAt === "number"
                ? item.updatedAt
                : typeof item?.createdAt === "number"
                  ? item.createdAt
                  : Date.now(),
            pinned: Boolean(item?.pinned),
            weight: typeof item?.weight === "number" ? item.weight : 1,
            source:
              typeof item?.source === "string" && ["auto", "imported", "manual"].includes(item.source)
                ? (item.source as MemoryItem["source"])
                : "manual",
          }))
          .filter((item) => item.content.length > 0)
          .slice(-MAX_MEMORY_ITEMS);

        return {
          ...currentState,
          ...persisted,
          profile: {
            preferences: profilePreferences,
          },
          items,
          isImporting: false,
        };
      },
    }
  )
);
