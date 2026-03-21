import { create } from "zustand";
import type { OpenRouterToolDefinition } from "../lib/openrouter";
import { createTauriMcpBridge } from "../lib/mcpClient";
import type {
  McpNormalizedTool,
  McpServerConfig,
  McpServerRuntimeState,
} from "../lib/mcpHost";
import { McpHost } from "../lib/mcpHost";

interface McpState {
  serverStates: Record<string, McpServerRuntimeState>;
  tools: McpNormalizedTool[];
  isSyncing: boolean;
  syncWithSettings: (configs: McpServerConfig[]) => Promise<void>;
  connectServer: (config: McpServerConfig) => Promise<void>;
  disconnectServer: (serverId: string) => Promise<void>;
  refreshServerTools: (serverId: string) => Promise<void>;
  executeToolCall: (params: {
    openRouterName: string;
    arguments: unknown;
    timeoutMs?: number;
  }) => Promise<unknown>;
  getOpenRouterTools: () => OpenRouterToolDefinition[];
}

const mcpHost = new McpHost(createTauriMcpBridge());

const toStateMap = (servers: McpServerRuntimeState[]) =>
  servers.reduce<Record<string, McpServerRuntimeState>>((acc, item) => {
    acc[item.serverId] = item;
    return acc;
  }, {});

const applyHostSnapshot = (set: (next: Partial<McpState>) => void) => {
  const snapshot = mcpHost.getSnapshot();
  set({
    serverStates: toStateMap(snapshot.servers),
    tools: snapshot.tools,
  });
};

export const useMcpStore = create<McpState>()((set) => ({
  serverStates: {},
  tools: [],
  isSyncing: false,

  syncWithSettings: async (configs) => {
    set({ isSyncing: true });
    try {
      await mcpHost.syncEnabledServers(configs);
    } finally {
      applyHostSnapshot(set);
      set({ isSyncing: false });
    }
  },

  connectServer: async (config) => {
    await mcpHost.connectServer(config);
    applyHostSnapshot(set);
  },

  disconnectServer: async (serverId) => {
    await mcpHost.disconnectServer(serverId);
    applyHostSnapshot(set);
  },

  refreshServerTools: async (serverId) => {
    await mcpHost.refreshServerTools(serverId);
    applyHostSnapshot(set);
  },

  executeToolCall: async ({ openRouterName, arguments: args, timeoutMs }) =>
    mcpHost.callToolByOpenRouterName(openRouterName, args, timeoutMs),

  getOpenRouterTools: () => mcpHost.getOpenRouterTools(),
}));
