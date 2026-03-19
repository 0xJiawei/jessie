import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "dark" | "light" | "system";
export type CloseBehavior = "ask" | "quit" | "minimize";

export type SettingsTab =
  | "general"
  | "models"
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
  sidebarWidth: number;
  settingsTab: SettingsTab;
  isSettingsOpen: boolean;
  setApiKey: (value: string) => void;
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
  setSidebarWidth: (value: number) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  addModel: () => void;
  updateModel: (index: number, patch: Partial<ModelConfig>) => void;
  removeModel: (index: number) => void;
  openSettings: () => void;
  closeSettings: () => void;
}

const validTab = (value: string): value is SettingsTab =>
  ["general", "models", "memory", "data", "appearance", "advanced"].includes(value);

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

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: "",
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
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      settingsTab: "general",
      isSettingsOpen: false,
      setApiKey: (value) => set({ apiKey: value }),
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
