import { Link2, Pencil, Plus, RefreshCw, Trash2, Unplug } from "lucide-react";
import { useMemo, useState } from "react";
import type { McpServerConfig } from "../../lib/mcpHost";
import { validateMcpServerConfig } from "../../lib/mcpHost";
import { useMcpStore } from "../../store/useMcpStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import ConfirmDialog from "../common/ConfirmDialog";
import SettingCard from "./SettingCard";
import type { SectionFeedbackHandlers } from "./types";

interface McpDraft {
  id: string;
  name: string;
  enabled: boolean;
  command: string;
  argsText: string;
  envText: string;
  cwd: string;
  startupTimeoutMs: string;
}

const createId = () => `mcp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const emptyDraft = (): McpDraft => ({
  id: createId(),
  name: "",
  enabled: true,
  command: "",
  argsText: "",
  envText: "",
  cwd: "",
  startupTimeoutMs: "",
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

const draftFromServer = (server: McpServerConfig): McpDraft => ({
  id: server.id,
  name: server.name,
  enabled: server.enabled,
  command: server.command,
  argsText: server.args.join("\n"),
  envText: Object.entries(server.env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n"),
  cwd: server.cwd ?? "",
  startupTimeoutMs: server.startupTimeoutMs ? String(server.startupTimeoutMs) : "",
});

const toServerConfig = (draft: McpDraft): McpServerConfig => {
  const parsedEnv = parseEnvText(draft.envText);
  if (parsedEnv.error) {
    throw new Error(parsedEnv.error);
  }

  const startupTimeoutMs = draft.startupTimeoutMs.trim()
    ? Number(draft.startupTimeoutMs)
    : undefined;

  return {
    id: draft.id,
    name: draft.name.trim(),
    enabled: draft.enabled,
    transport: "stdio",
    command: draft.command.trim(),
    args: parseLines(draft.argsText),
    env: parsedEnv.env,
    cwd: draft.cwd.trim() || undefined,
    startupTimeoutMs:
      typeof startupTimeoutMs === "number" && Number.isFinite(startupTimeoutMs)
        ? Math.max(1000, Math.round(startupTimeoutMs))
        : undefined,
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
  const servers = useSettingsStore((state) => state.mcpServers);
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
        setFieldError(Object.values(validation.errors)[0] ?? "Invalid MCP server config.");
        return;
      }

      upsertMcpServer(config);
      onSaved();

      if (config.enabled) {
        await connectServer(config);
        onMessage("MCP server connected.", false);
      } else {
        await disconnectServer(config.id);
        onMessage("MCP server saved.", false);
      }

      setShowForm(false);
      setEditingId(null);
      setFieldError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save MCP server.";
      setFieldError(message);
      onMessage(message, true);
    }
  };

  return (
    <div className="space-y-4">
      <SettingCard
        title="MCP Servers"
        description="Configure local stdio MCP servers and expose their tools to Jessie."
        action={
          <button
            type="button"
            onClick={startAdd}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-2.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
          >
            <Plus size={14} />
            Add server
          </button>
        }
      >
        <div className="mb-2 flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span>{servers.length} configured</span>
          <span>
            {enabledCount} enabled • {totalTools} tools available
          </span>
        </div>

        {servers.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)]">No MCP servers configured yet.</p>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => {
              const runtime = runtimeStates[server.id];
              const status = server.enabled ? runtime?.status ?? "Disconnected" : "Disconnected";
              const toolCount = runtime?.toolCount ?? 0;
              const statusDetail = runtime?.error || runtime?.warning;

              return (
                <div
                  key={server.id}
                  className="rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-[var(--text-primary)]">{server.name}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        stdio • {server.command || "command not set"} • {toolCount} tools
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
                            void connectServer(next).catch((error) => {
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
                      Enabled
                    </label>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className={`text-xs ${statusClass(status)}`}>{status}</p>
                    <div className="flex items-center gap-1">
                      {server.enabled && status !== "Connected" && (
                        <button
                          type="button"
                          onClick={() => {
                            void connectServer(server)
                              .then(() => onMessage("MCP server connected.", false))
                              .catch((error) =>
                                onMessage(
                                  error instanceof Error
                                    ? error.message
                                    : "Could not start this MCP server. Check the command and arguments.",
                                  true
                                )
                              );
                          }}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--border)] px-2 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
                        >
                          <Link2 size={12} />
                          Connect
                        </button>
                      )}

                      {server.enabled && status === "Connected" && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              void refreshServerTools(server.id)
                                .then(() => onMessage("MCP tools refreshed.", false))
                                .catch((error) =>
                                  onMessage(
                                    error instanceof Error ? error.message : "Failed to refresh MCP tools.",
                                    true
                                  )
                                );
                            }}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--border)] px-2 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
                          >
                            <RefreshCw size={12} />
                            Refresh
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void disconnectServer(server.id)
                                .then(() => onMessage("MCP server disconnected.", false))
                                .catch((error) =>
                                  onMessage(
                                    error instanceof Error ? error.message : "Failed to disconnect MCP server.",
                                    true
                                  )
                                );
                            }}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--border)] px-2 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
                          >
                            <Unplug size={12} />
                            Disconnect
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => startEdit(server)}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--border)] px-2 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
                      >
                        <Pencil size={12} />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteServerId(server.id)}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-red-400/30 px-2 text-xs text-red-300 transition hover:bg-red-500/10"
                      >
                        <Trash2 size={12} />
                        Delete
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
        <SettingCard title={editingId ? "Edit MCP Server" : "Add MCP Server"} description="Local stdio server configuration.">
          <div className="space-y-2">
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Server name"
              className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
            />

            <input
              value={draft.command}
              onChange={(event) => setDraft((current) => ({ ...current, command: event.target.value }))}
              placeholder="Command (e.g. npx)"
              className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
            />

            <textarea
              value={draft.argsText}
              onChange={(event) => setDraft((current) => ({ ...current, argsText: event.target.value }))}
              rows={3}
              placeholder="Args (one per line)"
              className="w-full resize-none rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
            />

            <textarea
              value={draft.envText}
              onChange={(event) => setDraft((current) => ({ ...current, envText: event.target.value }))}
              rows={3}
              placeholder="Env vars (KEY=VALUE, one per line)"
              className="w-full resize-none rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
            />

            <input
              value={draft.cwd}
              onChange={(event) => setDraft((current) => ({ ...current, cwd: event.target.value }))}
              placeholder="Working directory (optional)"
              className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
            />

            <input
              type="number"
              min={1000}
              step={500}
              value={draft.startupTimeoutMs}
              onChange={(event) =>
                setDraft((current) => ({ ...current, startupTimeoutMs: event.target.value }))
              }
              placeholder="Startup timeout ms (optional)"
              className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--focus)]"
            />

            <label className="inline-flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
              />
              Enabled
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
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void saveDraft();
                }}
                className="h-8 rounded-lg border border-[color:var(--border)] bg-[var(--message-user)] px-3 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]"
              >
                Save
              </button>
            </div>
          </div>
        </SettingCard>
      )}

      <ConfirmDialog
        open={deleteServerId !== null}
        title="Delete MCP server?"
        description="This server configuration will be removed."
        onCancel={() => setDeleteServerId(null)}
        onConfirm={() => {
          if (!deleteServerId) {
            return;
          }

          removeMcpServer(deleteServerId);
          void disconnectServer(deleteServerId);
          onSaved();
          onMessage("MCP server deleted.", false);
          setDeleteServerId(null);
        }}
      />
    </div>
  );
}

export default McpSection;
