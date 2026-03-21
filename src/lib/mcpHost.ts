import type { OpenRouterToolDefinition } from "./openrouter";

export type McpTransport = "stdio";
export type McpServerStatus = "Connected" | "Disconnected" | "Starting" | "Error";

export interface McpServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  transport: McpTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  startupTimeoutMs?: number;
  toolAllowlist?: string[];
  toolDenylist?: string[];
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpNormalizedTool extends McpTool {
  id: string;
  sourceType: "mcp";
  sourceServerId: string;
  sourceServerName: string;
  openRouterName: string;
  originalName: string;
  displayName: string;
}

export interface McpServerRuntimeState {
  serverId: string;
  serverName: string;
  enabled: boolean;
  transport: McpTransport;
  status: McpServerStatus;
  error?: string;
  warning?: string;
  toolCount: number;
}

export interface McpHostSnapshot {
  servers: McpServerRuntimeState[];
  tools: McpNormalizedTool[];
}

export interface McpConnectResponse {
  serverId: string;
  status: string;
  tools: Array<{
    name?: unknown;
    description?: unknown;
    inputSchema?: unknown;
  }>;
  warning?: string | null;
}

export interface McpRefreshToolsResponse {
  serverId: string;
  tools: Array<{
    name?: unknown;
    description?: unknown;
    inputSchema?: unknown;
  }>;
  warning?: string | null;
}

export interface McpCallToolResponse {
  result: unknown;
}

export interface McpBridge {
  connectServer: (config: McpServerConfig) => Promise<McpConnectResponse>;
  disconnectServer: (serverId: string) => Promise<void>;
  refreshServerTools: (serverId: string) => Promise<McpRefreshToolsResponse>;
  callTool: (request: {
    serverId: string;
    toolName: string;
    arguments: Record<string, unknown>;
    timeoutMs?: number;
  }) => Promise<McpCallToolResponse>;
}

interface McpServerConfigValidationErrors {
  id?: string;
  name?: string;
  transport?: string;
  command?: string;
  args?: string;
  env?: string;
  startupTimeoutMs?: string;
}

export interface McpServerConfigValidationResult {
  ok: boolean;
  errors: McpServerConfigValidationErrors;
}

interface ServerRecord {
  config: McpServerConfig;
  status: McpServerStatus;
  error?: string;
  warning?: string;
  tools: McpTool[];
  signature: string;
}

const DEFAULT_TOOL_TIMEOUT_MS = 15_000;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const sanitizeToken = (value: string) => {
  const replaced = value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!replaced) {
    return "tool";
  }

  if (/^\d/.test(replaced)) {
    return `t_${replaced}`;
  }

  return replaced;
};

const createFunctionName = (serverId: string, toolName: string, usedNames: Set<string>) => {
  const base = `mcp_${sanitizeToken(serverId).slice(0, 20)}_${sanitizeToken(toolName).slice(0, 32)}`;
  const maxLength = 64;
  let candidate = base.slice(0, maxLength);
  let suffix = 2;

  while (usedNames.has(candidate)) {
    const suffixToken = `_${suffix}`;
    candidate = `${base.slice(0, Math.max(1, maxLength - suffixToken.length))}${suffixToken}`;
    suffix += 1;
  }

  usedNames.add(candidate);
  return candidate;
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (!isPlainObject(value)) {
    return JSON.stringify(value);
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
};

const normalizeSchema = (value: unknown): Record<string, unknown> | null => {
  if (!isPlainObject(value)) {
    return null;
  }

  const hasType = typeof value.type === "string";
  if (hasType) {
    return value;
  }

  return {
    type: "object",
    properties: {},
    additionalProperties: true,
  };
};

export const validateMcpServerConfig = (
  config: Partial<McpServerConfig>
): McpServerConfigValidationResult => {
  const errors: McpServerConfigValidationErrors = {};

  if (typeof config.id !== "string" || config.id.trim().length === 0) {
    errors.id = "Server ID is required.";
  }

  if (typeof config.name !== "string" || config.name.trim().length === 0) {
    errors.name = "Server name is required.";
  }

  if (config.transport !== "stdio") {
    errors.transport = "Only stdio transport is supported in MCP v1.";
  }

  if (typeof config.command !== "string" || config.command.trim().length === 0) {
    errors.command = "Command is required.";
  }

  if (!Array.isArray(config.args) || config.args.some((item) => typeof item !== "string")) {
    errors.args = "Args must be a string array.";
  }

  if (!isPlainObject(config.env)) {
    errors.env = "Environment variables must be key-value pairs.";
  } else {
    const badEntry = Object.entries(config.env).find(
      ([key, value]) =>
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== "string"
    );
    if (badEntry) {
      errors.env = "Environment variables must use KEY=VALUE string pairs.";
    }
  }

  if (
    config.startupTimeoutMs !== undefined &&
    (!Number.isFinite(config.startupTimeoutMs) || Number(config.startupTimeoutMs) <= 0)
  ) {
    errors.startupTimeoutMs = "Startup timeout must be a positive number.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
  };
};

const normalizeTool = (tool: {
  name?: unknown;
  description?: unknown;
  inputSchema?: unknown;
}): McpTool | null => {
  if (typeof tool.name !== "string" || tool.name.trim().length === 0) {
    return null;
  }

  const schema = normalizeSchema(tool.inputSchema);
  if (!schema) {
    return null;
  }

  return {
    name: tool.name.trim(),
    description: typeof tool.description === "string" ? tool.description : "",
    inputSchema: schema,
  };
};

const parseDiscoveredTools = (
  tools: Array<{ name?: unknown; description?: unknown; inputSchema?: unknown }>
) => tools.map(normalizeTool).filter((tool): tool is McpTool => Boolean(tool));

const isToolAllowed = (config: McpServerConfig, toolName: string) => {
  const allowlist = new Set(
    (config.toolAllowlist ?? []).map((item) => item.trim()).filter((item) => item.length > 0)
  );
  const denylist = new Set(
    (config.toolDenylist ?? []).map((item) => item.trim()).filter((item) => item.length > 0)
  );

  if (denylist.has(toolName)) {
    return false;
  }

  if (allowlist.size === 0) {
    return true;
  }

  return allowlist.has(toolName);
};

export class McpHost {
  private readonly bridge: McpBridge;
  private readonly servers = new Map<string, ServerRecord>();
  private normalizedTools: McpNormalizedTool[] = [];

  constructor(bridge: McpBridge) {
    this.bridge = bridge;
  }

  getSnapshot(): McpHostSnapshot {
    const servers = Array.from(this.servers.values())
      .map((record) => ({
        serverId: record.config.id,
        serverName: record.config.name,
        enabled: record.config.enabled,
        transport: record.config.transport,
        status: record.status,
        error: record.error,
        warning: record.warning,
        toolCount: record.tools.length,
      }))
      .sort((a, b) => a.serverName.localeCompare(b.serverName));

    return {
      servers,
      tools: [...this.normalizedTools],
    };
  }

  getOpenRouterTools(): OpenRouterToolDefinition[] {
    return this.normalizedTools.map((tool) => ({
      type: "function",
      function: {
        name: tool.openRouterName,
        description: tool.description || `${tool.sourceServerName} MCP tool: ${tool.originalName}`,
        parameters: tool.inputSchema,
      },
    }));
  }

  private rebuildNormalizedTools() {
    const next: McpNormalizedTool[] = [];
    const usedNames = new Set<string>();

    for (const record of this.servers.values()) {
      if (record.status !== "Connected") {
        continue;
      }

      for (const tool of record.tools) {
        const openRouterName = createFunctionName(record.config.id, tool.name, usedNames);
        next.push({
          id: `${record.config.id}:${tool.name}`,
          sourceType: "mcp",
          sourceServerId: record.config.id,
          sourceServerName: record.config.name,
          openRouterName,
          originalName: tool.name,
          displayName: `${record.config.name} / ${tool.name}`,
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
    }

    this.normalizedTools = next;
  }

  private ensureRecord(config: McpServerConfig): ServerRecord {
    const signature = stableStringify(config);
    const existing = this.servers.get(config.id);
    if (existing) {
      existing.config = config;
      existing.signature = signature;
      return existing;
    }

    const created: ServerRecord = {
      config,
      status: "Disconnected",
      tools: [],
      signature,
    };
    this.servers.set(config.id, created);
    return created;
  }

  async syncEnabledServers(configs: McpServerConfig[]) {
    const configMap = new Map<string, McpServerConfig>();
    for (const config of configs) {
      configMap.set(config.id, config);
      this.ensureRecord(config);
    }

    for (const [serverId, record] of Array.from(this.servers.entries())) {
      if (!configMap.has(serverId) || !configMap.get(serverId)?.enabled) {
        if (record.status === "Connected" || record.status === "Starting" || record.status === "Error") {
          await this.disconnectServer(serverId);
        } else {
          record.status = "Disconnected";
          record.error = undefined;
          record.warning = undefined;
          record.tools = [];
        }
      }
    }

    for (const config of configMap.values()) {
      if (!config.enabled) {
        continue;
      }

      const record = this.ensureRecord(config);
      const nextSignature = stableStringify(config);
      const shouldReconnect =
        record.status !== "Connected" || record.signature !== nextSignature;

      if (!shouldReconnect) {
        continue;
      }

      try {
        await this.connectServer(config);
      } catch {
        // Keep syncing other servers; each server failure is isolated.
      }
    }

    this.rebuildNormalizedTools();
  }

  async connectServer(config: McpServerConfig) {
    const validation = validateMcpServerConfig(config);
    const record = this.ensureRecord(config);

    if (!validation.ok) {
      record.status = "Error";
      record.error = Object.values(validation.errors)[0] || "Invalid server config.";
      record.warning = undefined;
      record.tools = [];
      this.rebuildNormalizedTools();
      throw new Error(record.error);
    }

    record.status = "Starting";
    record.error = undefined;
    record.warning = undefined;
    record.tools = [];

    try {
      const response = await this.bridge.connectServer(config);
      const parsedTools = parseDiscoveredTools(response.tools);
      const malformedCount = response.tools.length - parsedTools.length;
      const discovered = parsedTools.filter((tool) =>
        isToolAllowed(config, tool.name)
      );
      record.status = "Connected";
      record.tools = discovered;
      record.error = undefined;
      record.warning =
        response.warning ??
        (malformedCount > 0
          ? "This server connected, but its tool definitions were invalid."
          : undefined);
      this.rebuildNormalizedTools();
    } catch (error) {
      record.status = "Error";
      record.error =
        error instanceof Error
          ? error.message
          : "Could not start this MCP server. Check the command and arguments.";
      record.warning = undefined;
      record.tools = [];
      this.rebuildNormalizedTools();
      throw error instanceof Error ? error : new Error(record.error);
    }
  }

  async disconnectServer(serverId: string) {
    const record = this.servers.get(serverId);
    if (!record) {
      return;
    }

    try {
      await this.bridge.disconnectServer(serverId);
    } catch {
      // Ignore disconnect errors, but still mark local state disconnected.
    }

    record.status = "Disconnected";
    record.error = undefined;
    record.warning = undefined;
    record.tools = [];
    this.rebuildNormalizedTools();
  }

  async refreshServerTools(serverId: string) {
    const record = this.servers.get(serverId);
    if (!record || record.status !== "Connected") {
      throw new Error("This MCP server is disconnected.");
    }

    try {
      const response = await this.bridge.refreshServerTools(serverId);
      const parsedTools = parseDiscoveredTools(response.tools);
      const malformedCount = response.tools.length - parsedTools.length;
      const discovered = parsedTools.filter((tool) =>
        isToolAllowed(record.config, tool.name)
      );

      record.tools = discovered;
      record.warning =
        response.warning ??
        (malformedCount > 0
          ? "This server connected, but its tool definitions were invalid."
          : undefined);
      record.error = undefined;
      record.status = "Connected";
      this.rebuildNormalizedTools();
    } catch (error) {
      record.status = "Error";
      record.error = error instanceof Error ? error.message : "Failed to refresh MCP tools.";
      record.tools = [];
      this.rebuildNormalizedTools();
      throw error instanceof Error ? error : new Error(record.error);
    }
  }

  async callToolByOpenRouterName(
    openRouterName: string,
    rawArguments: unknown,
    timeoutMs = DEFAULT_TOOL_TIMEOUT_MS
  ) {
    const tool = this.normalizedTools.find((item) => item.openRouterName === openRouterName);
    if (!tool) {
      throw new Error(`Unknown MCP tool: ${openRouterName}`);
    }

    const record = this.servers.get(tool.sourceServerId);
    if (!record || record.status !== "Connected") {
      throw new Error("This MCP server disconnected unexpectedly.");
    }

    const argumentsObject = isPlainObject(rawArguments) ? rawArguments : {};

    try {
      const response = await this.bridge.callTool({
        serverId: tool.sourceServerId,
        toolName: tool.originalName,
        arguments: argumentsObject,
        timeoutMs,
      });
      return response.result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "MCP tool execution failed.";
      if (/disconnected/i.test(message)) {
        record.status = "Error";
        record.error = message;
        record.tools = [];
        this.rebuildNormalizedTools();
      }
      throw error instanceof Error ? error : new Error(message);
    }
  }
}
