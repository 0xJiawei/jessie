import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  McpBridge,
  McpCallToolResponse,
  McpConnectResponse,
  McpReadResourceResponse,
  McpRefreshToolsResponse,
  McpRequestResponse,
  McpServerConfig,
} from "./mcpHost";

const ensureTauriContext = () => {
  if (!isTauri()) {
    throw new Error("MCP is only available in the desktop app runtime.");
  }
};

export const createTauriMcpBridge = (): McpBridge => ({
  connectServer: async (config: McpServerConfig): Promise<McpConnectResponse> => {
    ensureTauriContext();
    return invoke<McpConnectResponse>("mcp_connect_server", { config });
  },

  disconnectServer: async (serverId: string): Promise<void> => {
    ensureTauriContext();
    await invoke("mcp_disconnect_server", { serverId });
  },

  refreshServerTools: async (serverId: string): Promise<McpRefreshToolsResponse> => {
    ensureTauriContext();
    return invoke<McpRefreshToolsResponse>("mcp_refresh_server_tools", { serverId });
  },

  callTool: async (request): Promise<McpCallToolResponse> => {
    ensureTauriContext();
    return invoke<McpCallToolResponse>("mcp_call_tool", { request });
  },

  readResource: async (request): Promise<McpReadResourceResponse> => {
    ensureTauriContext();
    return invoke<McpReadResourceResponse>("mcp_read_resource", { request });
  },

  request: async (request): Promise<McpRequestResponse> => {
    ensureTauriContext();
    return invoke<McpRequestResponse>("mcp_request", { request });
  },
});
