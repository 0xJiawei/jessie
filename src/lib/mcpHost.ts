import type { OpenRouterToolDefinition } from "./openrouter";

export type McpTransport = "stdio" | "http";
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
  endpointUrl?: string;
  headers?: Record<string, string>;
  enableLegacySseFallback?: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  appResourceUri?: string;
}

export interface McpAppView {
  serverId: string;
  resourceUri: string;
  html: string;
  title: string;
  toolName: string;
  toolArguments?: Record<string, unknown>;
  toolResult?: unknown;
}

export interface McpToolExecutionResult {
  result: unknown;
  appView?: McpAppView;
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
    appResourceUri?: unknown;
  }>;
  warning?: string | null;
}

export interface McpRefreshToolsResponse {
  serverId: string;
  tools: Array<{
    name?: unknown;
    description?: unknown;
    inputSchema?: unknown;
    appResourceUri?: unknown;
  }>;
  warning?: string | null;
}

export interface McpCallToolResponse {
  result: unknown;
}

export interface McpReadResourceResponse {
  result: unknown;
}

export interface McpRequestResponse {
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
  readResource: (request: {
    serverId: string;
    uri: string;
    timeoutMs?: number;
  }) => Promise<McpReadResourceResponse>;
  request: (request: {
    serverId: string;
    method: string;
    params?: Record<string, unknown>;
    timeoutMs?: number;
  }) => Promise<McpRequestResponse>;
}

interface McpServerConfigValidationErrors {
  id?: string;
  name?: string;
  transport?: string;
  command?: string;
  args?: string;
  env?: string;
  endpointUrl?: string;
  headers?: string;
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

interface SyncOptions {
  allowedDomains?: string[];
}

interface ConnectOptions {
  allowedDomains?: string[];
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

  if (typeof value.type === "string") {
    return value;
  }

  return {
    type: "object",
    properties: {},
    additionalProperties: true,
  };
};

const normalizeHeaderRecord = (value: unknown) => {
  if (!isPlainObject(value)) {
    return false;
  }

  return !Object.entries(value).some(
    ([key, item]) => !/^[A-Za-z0-9-]+$/.test(key) || typeof item !== "string"
  );
};

const normalizeDomain = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

const hostnameMatches = (hostname: string, allowed: string) => {
  if (!allowed) return false;
  if (allowed.startsWith("*.")) {
    const suffix = allowed.slice(2);
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }
  return hostname === allowed;
};

export const isEndpointAllowedByDomains = (endpointUrl: string, allowedDomains: string[]) => {
  if (!endpointUrl) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(endpointUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  const normalizedAllowlist = allowedDomains
    .map(normalizeDomain)
    .filter((item) => item.length > 0);

  if (normalizedAllowlist.length === 0) {
    return false;
  }

  const host = url.hostname.toLowerCase();
  return normalizedAllowlist.some((allowed) => hostnameMatches(host, allowed));
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

  if (config.transport !== "stdio" && config.transport !== "http") {
    errors.transport = "Transport must be stdio or http.";
  }

  if (config.transport === "stdio") {
    if (typeof config.command !== "string" || config.command.trim().length === 0) {
      errors.command = "Command is required for stdio transport.";
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
  }

  if (config.transport === "http") {
    if (typeof config.endpointUrl !== "string" || config.endpointUrl.trim().length === 0) {
      errors.endpointUrl = "Endpoint URL is required for http transport.";
    } else {
      try {
        // URL format validation; security rules are handled separately.
        void new URL(config.endpointUrl.trim());
      } catch {
        errors.endpointUrl = "Endpoint URL is invalid.";
      }
    }

    const headers = config.headers ?? {};
    if (!normalizeHeaderRecord(headers)) {
      errors.headers = "Headers must use Header-Name: string format.";
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
  appResourceUri?: unknown;
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
    appResourceUri:
      typeof tool.appResourceUri === "string" && tool.appResourceUri.trim().length > 0
        ? tool.appResourceUri.trim()
        : undefined,
  };
};

const parseDiscoveredTools = (
  tools: Array<{ name?: unknown; description?: unknown; inputSchema?: unknown; appResourceUri?: unknown }>
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

const extractHtmlFromReadResourceResult = (result: unknown) => {
  if (!isPlainObject(result)) {
    return "";
  }

  const contents = Array.isArray(result.contents) ? result.contents : [];
  for (const item of contents) {
    if (!isPlainObject(item)) {
      continue;
    }

    const mimeType = typeof item.mimeType === "string" ? item.mimeType : "";
    const text = typeof item.text === "string" ? item.text : "";
    if (text && mimeType.toLowerCase().includes("text/html")) {
      return text;
    }

    const blob = typeof item.blob === "string" ? item.blob : "";
    if (blob && mimeType.toLowerCase().includes("text/html")) {
      try {
        const decoder =
          typeof globalThis !== "undefined" &&
          typeof globalThis.atob === "function"
            ? globalThis.atob.bind(globalThis)
            : null;
        if (decoder) {
          return decoder(blob);
        }
      } catch {
        // ignore decode failures
      }
    }
  }

  return "";
};

const extractAppResourceUriFromToolResult = (result: unknown) => {
  if (!isPlainObject(result)) {
    return "";
  }

  const candidates = [
    result._meta &&
    isPlainObject(result._meta) &&
    isPlainObject(result._meta.ui) &&
    typeof result._meta.ui.resourceUri === "string"
      ? result._meta.ui.resourceUri
      : "",
    result._meta && isPlainObject(result._meta) && typeof result._meta["ui/resourceUri"] === "string"
      ? String(result._meta["ui/resourceUri"])
      : "",
    result._meta && isPlainObject(result._meta) && typeof result._meta["openai/outputTemplate"] === "string"
      ? String(result._meta["openai/outputTemplate"])
      : "",
    typeof result.resourceUri === "string" ? result.resourceUri : "",
    typeof result.appResourceUri === "string" ? result.appResourceUri : "",
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (candidates.length > 0) {
    return candidates[0];
  }

  const content = Array.isArray(result.content) ? result.content : [];
  for (const item of content) {
    if (!isPlainObject(item)) {
      continue;
    }

    if (
      isPlainObject(item._meta) &&
      isPlainObject(item._meta.ui) &&
      typeof item._meta.ui.resourceUri === "string" &&
      item._meta.ui.resourceUri.trim().length > 0
    ) {
      return item._meta.ui.resourceUri.trim();
    }
  }

  return "";
};

const isTrustedAppResourceUri = (uri: string) => /^ui:\/\//i.test(uri.trim());

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
          appResourceUri: tool.appResourceUri,
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

  async syncEnabledServers(configs: McpServerConfig[], options?: SyncOptions) {
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
      const shouldReconnect = record.status !== "Connected" || record.signature !== nextSignature;

      if (!shouldReconnect) {
        continue;
      }

      try {
        await this.connectServer(config, options);
      } catch {
        // Keep syncing other servers; each server failure is isolated.
      }
    }

    this.rebuildNormalizedTools();
  }

  async connectServer(config: McpServerConfig, options?: ConnectOptions) {
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

    if (config.transport === "http") {
      const endpoint = config.endpointUrl?.trim() ?? "";
      const allowedDomains = options?.allowedDomains ?? [];
      if (!isEndpointAllowedByDomains(endpoint, allowedDomains)) {
        record.status = "Error";
        record.error = "Remote MCP endpoint must use HTTPS and match allowed domains.";
        record.warning = undefined;
        record.tools = [];
        this.rebuildNormalizedTools();
        throw new Error(record.error);
      }
    }

    record.status = "Starting";
    record.error = undefined;
    record.warning = undefined;
    record.tools = [];

    try {
      const response = await this.bridge.connectServer(config);
      const parsedTools = parseDiscoveredTools(response.tools);
      const malformedCount = response.tools.length - parsedTools.length;
      const discovered = parsedTools.filter((tool) => isToolAllowed(config, tool.name));
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
          : "Could not start this MCP server. Check the configuration.";
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
      const discovered = parsedTools.filter((tool) => isToolAllowed(record.config, tool.name));

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

  async requestServer(params: {
    serverId: string;
    method: string;
    params?: Record<string, unknown>;
    timeoutMs?: number;
  }) {
    return this.bridge.request(params);
  }

  async callToolByOpenRouterName(
    openRouterName: string,
    rawArguments: unknown,
    timeoutMs = DEFAULT_TOOL_TIMEOUT_MS
  ): Promise<McpToolExecutionResult> {
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

      let appView: McpAppView | undefined;
      const resourceUri = (tool.appResourceUri || extractAppResourceUriFromToolResult(response.result)).trim();
      if (resourceUri && isTrustedAppResourceUri(resourceUri)) {
        try {
          const readResult = await this.bridge.readResource({
            serverId: tool.sourceServerId,
            uri: resourceUri,
            timeoutMs,
          });
          const html = extractHtmlFromReadResourceResult(readResult.result);
          if (html) {
            appView = {
              serverId: tool.sourceServerId,
              resourceUri,
              html,
              title: tool.description || tool.originalName,
              toolName: tool.originalName,
              toolArguments: argumentsObject,
              toolResult: response.result,
            };
          }
        } catch {
          // Degrade gracefully when UI resource retrieval fails.
        }
      }

      return {
        result: response.result,
        appView,
      };
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
