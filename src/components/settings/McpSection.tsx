import { CircleHelp, Link2, Pencil, Plus, RefreshCw, Trash2, Unplug } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTr } from "../../lib/i18n";
import { isEndpointAllowedByDomains, type McpServerConfig } from "../../lib/mcpHost";
import { validateMcpServerConfig } from "../../lib/mcpHost";
import { useMcpStore } from "../../store/useMcpStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import ConfirmDialog from "../common/ConfirmDialog";
import SettingCard from "./SettingCard";
import Tooltip from "./Tooltip";
import type { SectionFeedbackHandlers } from "./types";

interface McpDraft {
  id: string;
  name: string;
  enabled: boolean;
  transport: "stdio" | "http";
  command: string;
  argsText: string;
  envText: string;
  cwd: string;
  startupTimeoutMs: string;
  endpointUrl: string;
  headersText: string;
  enableLegacySseFallback: boolean;
}

const createId = () => `mcp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const emptyDraft = (): McpDraft => ({
  id: createId(),
  name: "",
  enabled: true,
  transport: "stdio",
  command: "",
  argsText: "",
  envText: "",
  cwd: "",
  startupTimeoutMs: "",
  endpointUrl: "",
  headersText: "",
  enableLegacySseFallback: true,
});

const parseLines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const parseEnvText = (value: string) => {
  const env: Record<string, string> = {};
  const lines = parseLines(value);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const equalIndex = line.indexOf("=");

    if (equalIndex <= 0) {
      return {
        env: {},
        error: `Invalid env at line ${index + 1}. Use KEY=VALUE.`,
      };
    }

    const key = line.slice(0, equalIndex).trim();
    const valuePart = line.slice(equalIndex + 1);

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return {
        env: {},
        error: `Invalid env key at line ${index + 1}.`,
      };
    }

    env[key] = valuePart;
  }

  return { env };
};

const parseHeadersText = (value: string) => {
  const headers: Record<string, string> = {};
  const lines = parseLines(value);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const equalIndex = line.indexOf("=");

    if (equalIndex <= 0) {
      return {
        headers: {},
        error: `Invalid header at line ${index + 1}. Use Header-Name=Value.`,
      };
    }

    const key = line.slice(0, equalIndex).trim();
    const valuePart = line.slice(equalIndex + 1);

    if (!/^[A-Za-z0-9-]+$/.test(key)) {
      return {
        headers: {},
        error: `Invalid header name at line ${index + 1}.`,
      };
    }

    headers[key] = valuePart;
  }

  return { headers };
};

const parseDomains = (value: string) =>
  parseLines(value)
    .map((item) => item.toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, ""))
    .filter((item) => item.length > 0);

const draftFromServer = (server: McpServerConfig): McpDraft => ({
  id: server.id,
  name: server.name,
  enabled: server.enabled,
  transport: server.transport,
  command: server.command,
  argsText: server.args.join("\n"),
  envText: Object.entries(server.env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n"),
  cwd: server.cwd ?? "",
  startupTimeoutMs: server.startupTimeoutMs ? String(server.startupTimeoutMs) : "",
  endpointUrl: server.endpointUrl ?? "",
  headersText: Object.entries(server.headers ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join("\n"),
  enableLegacySseFallback: server.enableLegacySseFallback ?? true,
});

const toServerConfig = (draft: McpDraft): McpServerConfig => {
  const parsedEnv = parseEnvText(draft.envText);
  if (parsedEnv.error) {
    throw new Error(parsedEnv.error);
  }

  const parsedHeaders = parseHeadersText(draft.headersText);
  if (parsedHeaders.error) {
    throw new Error(parsedHeaders.error);
  }

  const startupTimeoutMs = draft.startupTimeoutMs.trim()
    ? Number(draft.startupTimeoutMs)
    : undefined;

  return {
    id: draft.id,
    name: draft.name.trim(),
    enabled: draft.enabled,
    transport: draft.transport,
    command: draft.command.trim(),
    args: parseLines(draft.argsText),
    env: parsedEnv.env,
    cwd: draft.cwd.trim() || undefined,
    startupTimeoutMs:
      typeof startupTimeoutMs === "number" && Number.isFinite(startupTimeoutMs)
        ? Math.max(1000, Math.round(startupTimeoutMs))
        : undefined,
    endpointUrl: draft.endpointUrl.trim() || undefined,
    headers: parsedHeaders.headers,
    enableLegacySseFallback: draft.enableLegacySseFallback,
  };
};

const statusClass = (status: string) => {
  if (status === "Connected") {
    return "text-emerald-300";
  }
  if (status === "Starting") {
    return "text-amber-300";
  }
  if (status === "Error") {
    return "text-red-300";
  }
  return "text-[var(--text-secondary)]";
};

function McpSection({ onSaved, onMessage }: SectionFeedbackHandlers) {
  const { t } = useTr();
  const servers = useSettingsStore((state) => state.mcpServers);
  const mcpAllowedDomains = useSettingsStore((state) => state.mcpAllowedDomains);
  const setMcpAllowedDomains = useSettingsStore((state) => state.setMcpAllowedDomains);
  const upsertMcpServer = useSettingsStore((state) => state.upsertMcpServer);
  const removeMcpServer = useSettingsStore((state) => state.removeMcpServer);

  const runtimeStates = useMcpStore((state) => state.serverStates);
  const tools = useMcpStore((state) => state.tools);
  const connectServer = useMcpStore((state) => state.connectServer);
  const disconnectServer = useMcpStore((state) => state.disconnectServer);
  const refreshServerTools = useMcpStore((state) => state.refreshServerTools);

  const [draft, setDraft] = useState<McpDraft>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteServerId, setDeleteServerId] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [domainsDraft, setDomainsDraft] = useState(mcpAllowedDomains.join("\n"));

  useEffect(() => {
    setDomainsDraft(mcpAllowedDomains.join("\n"));
  }, [mcpAllowedDomains]);

  const totalTools = tools.length;
  const enabledCount = useMemo(() => servers.filter((server) => server.enabled).length, [servers]);

  const startAdd = () => {
    setDraft(emptyDraft());
    setEditingId(null);
    setFieldError(null);
    setShowForm(true);
  };

  const startEdit = (server: McpServerConfig) => {
    setDraft(draftFromServer(server));
    setEditingId(server.id);
    setFieldError(null);
    setShowForm(true);
  };

  const saveDraft = async () => {
    try {
      const config = toServerConfig(draft);
      const validation = validateMcpServerConfig(config);

      if (!validation.ok) {
        setFieldError(Object.values(validation.errors)[0] ?? t("Invalid MCP server config.", "MCP 服务配置无效。"));
        return;
      }

      if (config.transport === "http" && !isEndpointAllowedByDomains(config.endpointUrl ?? "", mcpAllowedDomains)) {
        setFieldError(t("Remote endpoint must use HTTPS and match allowed domains.", "远程 endpoint 必须使用 HTTPS 且命中允许域名。"));
        return;
      }

      upsertMcpServer(config);
      onSaved();

      if (config.enabled) {
        await connectServer(config, mcpAllowedDomains);
        onMessage(t("MCP server connected.", "MCP 服务已连接。"), false);
      } else {
        await disconnectServer(config.id);
        onMessage(t("MCP server saved.", "MCP 服务已保存。"), false);
      }

      setShowForm(false);
      setEditingId(null);
      setFieldError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("Failed to save MCP server.", "保存 MCP 服务失败。");
      setFieldError(message);
      onMessage(message, true);
    }
  };

  return (
    <div className="space-y-4">
      <SettingCard
        title={t("Remote Security", "远程安全")}
        description={t("Only HTTPS endpoints from allowed domains can be connected.", "仅允许连接白名单域名下的 HTTPS endpoint。")}
      >
        <div className="mb-2 flex items-center gap-1 text-xs text-[var(--text-secondary)]">
          <span>{t("Allowed domains (whitelist)", "允许域名（白名单）")}</span>
          <Tooltip content={t(
            "This list defines which remote hosts Jessie can connect to. It is global safety policy, not the server endpoint itself. Example: api.example.com or *.trusted.tools",
            "该列表定义 Jessie 可连接的远程主机，是全局安全策略，不是具体 server endpoint。示例：api.example.com 或 *.trusted.tools"
          )}>
            <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-[color:var(--border)] text-[10px]">
              <CircleHelp size={11} />
            </span>
          </Tooltip>
        </div>
        <textarea
          value={domainsDraft}
          onChange={(event) => setDomainsDraft(event.target.value)}
          onBlur={() => {
            const parsed = parseDomains(domainsDraft);
            setMcpAllowedDomains(parsed);
            onSaved();
          }}
          rows={3}
          placeholder={"api.example.com\n*.trusted.tools"}
          className="w-full resize-none rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
        />
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {t("One domain per line. Wildcard subdomain supported with *.", "每行一个域名，支持 * 通配子域。")}
        </p>
      </SettingCard>

      <SettingCard
        title={t("MCP Servers", "MCP 服务")}
        description={t("Configure stdio/http MCP servers and expose their tools to Jessie.", "配置 stdio/http MCP 服务并向 Jessie 暴露工具。")}
        action={
          <button
            type="button"
            onClick={startAdd}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-2.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
          >
            <Plus size={14} />
            {t("Add server", "添加服务")}
          </button>
        }
      >
        <div className="mb-2 flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span>{t("{count} configured", "已配置 {count} 个", { count: servers.length })}</span>
          <span>
            {t("{enabled} enabled • {tools} tools available", "已启用 {enabled} 个 • 可用工具 {tools} 个", {
              enabled: enabledCount,
              tools: totalTools,
            })}
          </span>
        </div>

        {servers.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)]">{t("No MCP servers configured yet.", "还没有配置 MCP 服务。")}</p>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => {
              const runtime = runtimeStates[server.id];
              const status = server.enabled ? runtime?.status ?? "Disconnected" : "Disconnected";
              const toolCount = runtime?.toolCount ?? 0;
              const statusDetail = runtime?.error || runtime?.warning;
              const targetLabel =
                server.transport === "http"
                  ? server.endpointUrl || t("endpoint not set", "未设置 endpoint")
                  : server.command || t("command not set", "未设置命令");

              return (
                <div
                  key={server.id}
                  className="rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-[var(--text-primary)]">{server.name}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {server.transport} • {targetLabel} • {toolCount} tools
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                      <input
                        type="checkbox"
                        checked={server.enabled}
                        onChange={(event) => {
                          const next = { ...server, enabled: event.target.checked };
                          upsertMcpServer(next);
                          onSaved();
                          if (next.enabled) {
                            void connectServer(next, mcpAllowedDomains).catch((error) => {
                              onMessage(
                                error instanceof Error ? error.message : "Failed to connect MCP server.",
                                true
                              );
                            });
                          } else {
                            void disconnectServer(next.id);
                          }
                        }}
                      />
                      {t("Enabled", "启用")}
                    </label>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className={`text-xs ${statusClass(status)}`}>{status}</p>
                    <div className="flex items-center gap-1">
                      {server.enabled && status !== "Connected" && (
                        <button
                          type="button"
                          onClick={() => {
                            void connectServer(server, mcpAllowedDomains)
                              .then(() => onMessage(t("MCP server connected.", "MCP 服务已连接。"), false))
                              .catch((error) =>
                                onMessage(
                                  error instanceof Error
                                    ? error.message
                                    : t("Could not start this MCP server. Check configuration.", "无法启动 MCP 服务，请检查配置。"),
                                  true
                                )
                              );
                          }}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--border)] px-2 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
                        >
                          <Link2 size={12} />
                          {t("Connect", "连接")}
                        </button>
                      )}

                      {server.enabled && status === "Connected" && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              void refreshServerTools(server.id)
                                .then(() => onMessage(t("MCP tools refreshed.", "MCP 工具已刷新。"), false))
                                .catch((error) =>
                                  onMessage(
                                    error instanceof Error ? error.message : t("Failed to refresh MCP tools.", "刷新 MCP 工具失败。"),
                                    true
                                  )
                                );
                            }}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--border)] px-2 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
                          >
                            <RefreshCw size={12} />
                            {t("Refresh", "刷新")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void disconnectServer(server.id)
                                .then(() => onMessage(t("MCP server disconnected.", "MCP 服务已断开。"), false))
                                .catch((error) =>
                                  onMessage(
                                    error instanceof Error ? error.message : t("Failed to disconnect MCP server.", "断开 MCP 服务失败。"),
                                    true
                                  )
                                );
                            }}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--border)] px-2 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
                          >
                            <Unplug size={12} />
                            {t("Disconnect", "断开")}
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => startEdit(server)}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--border)] px-2 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
                      >
                        <Pencil size={12} />
                        {t("Edit", "编辑")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteServerId(server.id)}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-red-400/30 px-2 text-xs text-red-300 transition hover:bg-red-500/10"
                      >
                        <Trash2 size={12} />
                        {t("Delete", "删除")}
                      </button>
                    </div>
                  </div>

                  {statusDetail && <p className="mt-1 text-xs text-red-300">{statusDetail}</p>}
                </div>
              );
            })}
          </div>
        )}
      </SettingCard>

      {showForm && (
        <SettingCard
          title={editingId ? t("Edit MCP Server", "编辑 MCP 服务") : t("Add MCP Server", "添加 MCP 服务")}
          description={t("MCP server configuration.", "MCP 服务配置。")}
        >
          <div className="space-y-2">
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder={t("Server name", "服务名称")}
              className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
            />

            <select
              value={draft.transport}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  transport: event.target.value === "http" ? "http" : "stdio",
                }))
              }
              className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
            >
              <option value="stdio">{t("stdio (local process)", "stdio（本地进程）")}</option>
              <option value="http">{t("http (remote MCP)", "http（远程 MCP）")}</option>
            </select>

            {draft.transport === "stdio" ? (
              <>
                <input
                  value={draft.command}
                  onChange={(event) => setDraft((current) => ({ ...current, command: event.target.value }))}
                  placeholder={t("Command (e.g. npx)", "命令（例如 npx）")}
                  className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
                />

                <textarea
                  value={draft.argsText}
                  onChange={(event) => setDraft((current) => ({ ...current, argsText: event.target.value }))}
                  rows={3}
                  placeholder={t("Args (one per line)", "参数（每行一个）")}
                  className="w-full resize-none rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
                />

                <textarea
                  value={draft.envText}
                  onChange={(event) => setDraft((current) => ({ ...current, envText: event.target.value }))}
                  rows={3}
                  placeholder={t("Env vars (KEY=VALUE, one per line)", "环境变量（KEY=VALUE，每行一个）")}
                  className="w-full resize-none rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
                />

                <input
                  value={draft.cwd}
                  onChange={(event) => setDraft((current) => ({ ...current, cwd: event.target.value }))}
                  placeholder={t("Working directory (optional)", "工作目录（可选）")}
                  className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
                />
              </>
            ) : (
              <>
                <div className="mb-1 flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                  <span>{t("Endpoint URL", "Endpoint URL")}</span>
                  <Tooltip content={t(
                    "The exact URL of this MCP server (for example https://api.example.com/mcp). It must be HTTPS and its domain must be in Remote Security allowed domains.",
                    "该 MCP 服务的完整 URL（例如 https://api.example.com/mcp）。必须是 HTTPS，且域名在远程安全白名单内。"
                  )}>
                    <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-[color:var(--border)] text-[10px]">
                      <CircleHelp size={11} />
                    </span>
                  </Tooltip>
                </div>
                <input
                  value={draft.endpointUrl}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, endpointUrl: event.target.value }))
                  }
                  placeholder={t("Endpoint URL (https://...)", "Endpoint URL（https://...）")}
                  className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
                />
                <div className="mb-1 mt-1 flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                  <span>{t("Headers", "请求头")}</span>
                  <Tooltip content={t(
                    "Optional request headers for this server only. Commonly used for Authorization tokens. Format: Header-Name=Value",
                    "仅对当前服务生效的可选请求头。常用于 Authorization。格式：Header-Name=Value"
                  )}>
                    <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-[color:var(--border)] text-[10px]">
                      <CircleHelp size={11} />
                    </span>
                  </Tooltip>
                </div>
                <textarea
                  value={draft.headersText}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, headersText: event.target.value }))
                  }
                  rows={3}
                  placeholder={"Headers (Header-Name=Value)\nAuthorization=Bearer ..."}
                  className="w-full resize-none rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
                />
                <label className="inline-flex items-center gap-2 text-sm text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={draft.enableLegacySseFallback}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        enableLegacySseFallback: event.target.checked,
                      }))
                    }
                  />
                  {t("Enable legacy SSE fallback", "启用 legacy SSE 回退")}
                </label>
              </>
            )}

            <input
              type="number"
              min={1000}
              step={500}
              value={draft.startupTimeoutMs}
              onChange={(event) =>
                setDraft((current) => ({ ...current, startupTimeoutMs: event.target.value }))
              }
              placeholder={t("Timeout ms (optional)", "超时时间 ms（可选）")}
              className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
            />

            <label className="inline-flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
              />
              {t("Enabled", "启用")}
            </label>

            {fieldError && <p className="text-xs text-red-300">{fieldError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setFieldError(null);
                }}
                className="h-8 rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
              >
                {t("Cancel", "取消")}
              </button>
              <button
                type="button"
                onClick={() => {
                  void saveDraft();
                }}
                className="h-8 rounded-lg border border-[color:var(--border)] bg-[var(--message-user)] px-3 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]"
              >
                {t("Save", "保存")}
              </button>
            </div>
          </div>
        </SettingCard>
      )}

      <ConfirmDialog
        open={deleteServerId !== null}
        title={t("Delete MCP server?", "删除 MCP 服务？")}
        description={t("This server configuration will be removed.", "该服务配置将被移除。")}
        onCancel={() => setDeleteServerId(null)}
        onConfirm={() => {
          if (!deleteServerId) {
            return;
          }

          removeMcpServer(deleteServerId);
          void disconnectServer(deleteServerId);
          onSaved();
          onMessage(t("MCP server deleted.", "MCP 服务已删除。"), false);
          setDeleteServerId(null);
        }}
      />
    </div>
  );
}

export default McpSection;
