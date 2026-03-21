import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { McpServerConfig } from "../lib/mcpHost";

export type ThemeMode = "dark" | "light" | "system";
export type CloseBehavior = "ask" | "quit" | "minimize";

export type SettingsTab =
  | "general"
  | "models"
  | "mcp"
  | "memory"
  | "data"
  | "appearance"
  | "advanced";

export interface ModelConfig {
  id: string;
  name: string;
}

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 400;
const SIDEBAR_DEFAULT_WIDTH = 240;

const clampSidebarWidth = (width: number) => {
  if (Number.isNaN(width)) {
    return SIDEBAR_DEFAULT_WIDTH;
  }

  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
};

const clampTemperature = (value: number) => Math.min(2, Math.max(0, value));
const clampFontSize = (value: number) => Math.min(20, Math.max(12, value));
const clampUiScale = (value: number) => Math.min(115, Math.max(85, value));

interface SettingsState {
  apiKey: string;
  tavilyApiKey: string;
  language: string;
  models: ModelConfig[];
  defaultModelId: string;
  modelTemperature: number;
  modelMaxTokens: number | null;
  autoWebSearch: boolean;
  autoReasoning: boolean;
  webSearchEnabled: boolean;
  reasoningEnabled: boolean;
  webSearchToolEnabled: boolean;
  fileUploadEnabled: boolean;
  imageInputEnabled: boolean;
  memoryEnabled: boolean;
  theme: ThemeMode;
  fontSize: number;
  uiScale: number;
  debugMode: boolean;
  experimentalFeatures: boolean;
  closeBehavior: CloseBehavior;
  mcpServers: McpServerConfig[];
  sidebarWidth: number;
  settingsTab: SettingsTab;
  isSettingsOpen: boolean;
  setApiKey: (value: string) => void;
  setTavilyApiKey: (value: string) => void;
  setLanguage: (value: string) => void;
  setDefaultModelId: (value: string) => void;
  setModelTemperature: (value: number) => void;
  setModelMaxTokens: (value: number | null) => void;
  setAutoWebSearch: (value: boolean) => void;
  setAutoReasoning: (value: boolean) => void;
  setWebSearchEnabled: (value: boolean) => void;
  setReasoningEnabled: (value: boolean) => void;
  setWebSearchToolEnabled: (value: boolean) => void;
  setFileUploadEnabled: (value: boolean) => void;
  setImageInputEnabled: (value: boolean) => void;
  setMemoryEnabled: (value: boolean) => void;
  setTheme: (value: ThemeMode) => void;
  setFontSize: (value: number) => void;
  setUiScale: (value: number) => void;
  setDebugMode: (value: boolean) => void;
  setExperimentalFeatures: (value: boolean) => void;
  setCloseBehavior: (value: CloseBehavior) => void;
  setMcpServers: (servers: McpServerConfig[]) => void;
  upsertMcpServer: (server: McpServerConfig) => void;
  removeMcpServer: (id: string) => void;
  setSidebarWidth: (value: number) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  addModel: () => void;
  updateModel: (index: number, patch: Partial<ModelConfig>) => void;
  removeModel: (index: number) => void;
  openSettings: () => void;
  closeSettings: () => void;
}

const validTab = (value: string): value is SettingsTab =>
  ["general", "models", "mcp", "memory", "data", "appearance", "advanced"].includes(value);

const sanitizeModels = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as ModelConfig[];
  }

  return value.map((entry) => ({
    id: typeof (entry as { id?: unknown })?.id === "string" ? (entry as { id: string }).id : "",
    name:
      typeof (entry as { name?: unknown })?.name === "string" ? (entry as { name: string }).name : "",
  }));
};

const sanitizeStringList = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];

const sanitizeEnv = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, string>;
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
    (acc, [key, raw]) => {
      if (typeof key !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        return acc;
      }
      if (typeof raw !== "string") {
        return acc;
      }
      acc[key] = raw;
      return acc;
    },
    {}
  );
};

const sanitizeMcpServers = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as McpServerConfig[];
  }

  return value.reduce<McpServerConfig[]>((acc, entry) => {
      const raw = (entry ?? {}) as Partial<McpServerConfig>;
      const id = typeof raw.id === "string" ? raw.id.trim() : "";
      const name = typeof raw.name === "string" ? raw.name.trim() : "";

      if (!id || !name) {
        return acc;
      }

      acc.push({
        id,
        name,
        enabled: Boolean(raw.enabled),
        transport: "stdio" as const,
        command: typeof raw.command === "string" ? raw.command.trim() : "",
        args: sanitizeStringList(raw.args),
        env: sanitizeEnv(raw.env),
        cwd: typeof raw.cwd === "string" ? raw.cwd.trim() : undefined,
        startupTimeoutMs:
          typeof raw.startupTimeoutMs === "number" && Number.isFinite(raw.startupTimeoutMs)
            ? Math.max(1000, Math.round(raw.startupTimeoutMs))
            : undefined,
        toolAllowlist: sanitizeStringList(raw.toolAllowlist),
        toolDenylist: sanitizeStringList(raw.toolDenylist),
      });
      return acc;
    }, []);
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: "",
      tavilyApiKey: "",
      language: "English",
      models: [],
      defaultModelId: "",
      modelTemperature: 0.2,
      modelMaxTokens: null,
      autoWebSearch: false,
      autoReasoning: false,
      webSearchEnabled: false,
      reasoningEnabled: false,
      webSearchToolEnabled: true,
      fileUploadEnabled: true,
      imageInputEnabled: true,
      memoryEnabled: true,
      theme: "dark",
      fontSize: 14,
      uiScale: 100,
      debugMode: false,
      experimentalFeatures: false,
      closeBehavior: "ask",
      mcpServers: [],
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      settingsTab: "general",
      isSettingsOpen: false,
      setApiKey: (value) => set({ apiKey: value }),
      setTavilyApiKey: (value) => set({ tavilyApiKey: value }),
      setLanguage: (value) => set({ language: value }),
      setDefaultModelId: (value) => set({ defaultModelId: value }),
      setModelTemperature: (value) => set({ modelTemperature: clampTemperature(value) }),
      setModelMaxTokens: (value) =>
        set({
          modelMaxTokens:
            typeof value === "number" && Number.isFinite(value)
              ? Math.max(256, Math.round(value))
              : null,
        }),
      setAutoWebSearch: (value) => set({ autoWebSearch: value, webSearchEnabled: value }),
      setAutoReasoning: (value) => set({ autoReasoning: value, reasoningEnabled: value }),
      setWebSearchEnabled: (value) => set({ webSearchEnabled: value }),
      setReasoningEnabled: (value) => set({ reasoningEnabled: value }),
      setWebSearchToolEnabled: (value) => set({ webSearchToolEnabled: value }),
      setFileUploadEnabled: (value) => set({ fileUploadEnabled: value }),
      setImageInputEnabled: (value) => set({ imageInputEnabled: value }),
      setMemoryEnabled: (value) => set({ memoryEnabled: value }),
      setTheme: (value) => set({ theme: value }),
      setFontSize: (value) => set({ fontSize: clampFontSize(value) }),
      setUiScale: (value) => set({ uiScale: clampUiScale(value) }),
      setDebugMode: (value) => set({ debugMode: value }),
      setExperimentalFeatures: (value) => set({ experimentalFeatures: value }),
      setCloseBehavior: (value) => set({ closeBehavior: value }),
      setMcpServers: (servers) => set({ mcpServers: sanitizeMcpServers(servers) }),
      upsertMcpServer: (server) =>
        set((state) => {
          const sanitized = sanitizeMcpServers([server])[0];
          if (!sanitized) {
            return state;
          }

          const existingIndex = state.mcpServers.findIndex((item) => item.id === sanitized.id);
          if (existingIndex === -1) {
            return {
              mcpServers: [...state.mcpServers, sanitized],
            };
          }

          return {
            mcpServers: state.mcpServers.map((item, index) =>
              index === existingIndex ? sanitized : item
            ),
          };
        }),
      removeMcpServer: (id) =>
        set((state) => ({
          mcpServers: state.mcpServers.filter((server) => server.id !== id),
        })),
      setSidebarWidth: (value) => set({ sidebarWidth: clampSidebarWidth(value) }),
      setSettingsTab: (tab) => set({ settingsTab: tab }),
      addModel: () =>
        set((state) => ({
          models: [...state.models, { id: "", name: "" }],
        })),
      updateModel: (index, patch) =>
        set((state) => ({
          models: state.models.map((model, currentIndex) =>
            currentIndex === index
              ? {
                  ...model,
                  id: typeof patch.id === "string" ? patch.id : model.id,
                  name: typeof patch.name === "string" ? patch.name : model.name,
                }
              : model
          ),
        })),
      removeModel: (index) =>
        set((state) => ({
          models: state.models.filter((_, currentIndex) => currentIndex !== index),
        })),
      openSettings: () => set({ isSettingsOpen: true }),
      closeSettings: () => set({ isSettingsOpen: false }),
    }),
    {
      name: "jessie-settings",
      partialize: (state) => ({
        apiKey: state.apiKey,
        tavilyApiKey: state.tavilyApiKey,
        language: state.language,
        models: state.models,
        defaultModelId: state.defaultModelId,
        modelTemperature: state.modelTemperature,
        modelMaxTokens: state.modelMaxTokens,
        autoWebSearch: state.autoWebSearch,
        autoReasoning: state.autoReasoning,
        webSearchEnabled: state.webSearchEnabled,
        reasoningEnabled: state.reasoningEnabled,
        webSearchToolEnabled: state.webSearchToolEnabled,
        fileUploadEnabled: state.fileUploadEnabled,
        imageInputEnabled: state.imageInputEnabled,
        memoryEnabled: state.memoryEnabled,
        theme: state.theme,
        fontSize: state.fontSize,
        uiScale: state.uiScale,
        debugMode: state.debugMode,
        experimentalFeatures: state.experimentalFeatures,
        closeBehavior: state.closeBehavior,
        mcpServers: state.mcpServers,
        sidebarWidth: state.sidebarWidth,
        settingsTab: state.settingsTab,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<SettingsState>;
        const models = sanitizeModels(persisted.models);
        const validModelIds = new Set(
          models.map((model) => model.id.trim()).filter((id) => id.length > 0)
        );
        const persistedDefaultModelId =
          typeof persisted.defaultModelId === "string" ? persisted.defaultModelId.trim() : "";

        return {
          ...currentState,
          ...persisted,
          models,
          tavilyApiKey:
            typeof persisted.tavilyApiKey === "string" ? persisted.tavilyApiKey : currentState.tavilyApiKey,
          webSearchToolEnabled: true,
          fileUploadEnabled: true,
          imageInputEnabled: true,
          theme:
            typeof persisted.theme === "string" && ["dark", "light", "system"].includes(persisted.theme)
              ? persisted.theme
              : currentState.theme,
          defaultModelId:
            persistedDefaultModelId && validModelIds.has(persistedDefaultModelId)
              ? persistedDefaultModelId
              : "",
          modelTemperature:
            typeof persisted.modelTemperature === "number"
              ? clampTemperature(persisted.modelTemperature)
              : currentState.modelTemperature,
          modelMaxTokens:
            typeof persisted.modelMaxTokens === "number"
              ? persisted.modelMaxTokens > 0
                ? persisted.modelMaxTokens === 2048
                  ? null
                  : Math.max(256, Math.round(persisted.modelMaxTokens))
                : null
              : null,
          fontSize:
            typeof persisted.fontSize === "number"
              ? clampFontSize(persisted.fontSize)
              : currentState.fontSize,
          uiScale:
            typeof persisted.uiScale === "number" ? clampUiScale(persisted.uiScale) : currentState.uiScale,
          closeBehavior:
            typeof persisted.closeBehavior === "string" && ["ask", "quit", "minimize"].includes(persisted.closeBehavior)
              ? (persisted.closeBehavior as CloseBehavior)
              : currentState.closeBehavior,
          mcpServers: sanitizeMcpServers(persisted.mcpServers),
          sidebarWidth: clampSidebarWidth(
            typeof persisted.sidebarWidth === "number"
              ? persisted.sidebarWidth
              : currentState.sidebarWidth
          ),
          settingsTab:
            typeof persisted.settingsTab === "string" && validTab(persisted.settingsTab)
              ? persisted.settingsTab
              : currentState.settingsTab,
        };
      },
    }
  )
);
