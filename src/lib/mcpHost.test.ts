import { describe, expect, it, vi } from "vitest";
import type { McpBridge, McpServerConfig } from "./mcpHost";
import { McpHost, isEndpointAllowedByDomains, validateMcpServerConfig } from "./mcpHost";

const createServerConfig = (patch?: Partial<McpServerConfig>): McpServerConfig => ({
  id: "server-1",
  name: "Server One",
  enabled: true,
  transport: "stdio",
  command: "node",
  args: ["server.js"],
  env: {},
  ...patch,
});

const createBridge = (overrides?: Partial<McpBridge>): McpBridge => ({
  connectServer: vi.fn(async () => ({
    serverId: "server-1",
    status: "Connected",
    tools: [],
    warning: null,
  })),
  disconnectServer: vi.fn(async () => {}),
  refreshServerTools: vi.fn(async () => ({
    serverId: "server-1",
    tools: [],
    warning: null,
  })),
  callTool: vi.fn(async () => ({ result: { ok: true } })),
  readResource: vi.fn(async () => ({ result: { contents: [] } })),
  request: vi.fn(async () => ({ result: {} })),
  ...overrides,
});

describe("mcp config validation", () => {
  it("accepts valid stdio server config", () => {
    const result = validateMcpServerConfig(createServerConfig());
    expect(result.ok).toBe(true);
  });

  it("rejects missing command", () => {
    const result = validateMcpServerConfig(createServerConfig({ command: "" }));
    expect(result.ok).toBe(false);
    expect(result.errors.command).toBeTruthy();
  });

  it("rejects malformed args/env", () => {
    const result = validateMcpServerConfig({
      ...createServerConfig(),
      args: ["ok", 1 as unknown as string],
      env: {
        GOOD: "x",
        "bad-key": "y",
      },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.args || result.errors.env).toBeTruthy();
  });
});

describe("mcp remote security", () => {
  it("allows only HTTPS endpoints that match allowed domains", () => {
    expect(
      isEndpointAllowedByDomains("https://example.com/mcp", ["example.com", "*.trusted.dev"])
    ).toBe(true);
    expect(
      isEndpointAllowedByDomains("https://tools.trusted.dev/connect", ["example.com", "*.trusted.dev"])
    ).toBe(true);
    expect(isEndpointAllowedByDomains("http://api.example.com/mcp", ["example.com"])).toBe(false);
    expect(isEndpointAllowedByDomains("https://evil.com/mcp", ["example.com"])).toBe(false);
  });

  it("rejects http transport when endpoint is not in allowlist", async () => {
    const bridge = createBridge();
    const host = new McpHost(bridge);
    const httpConfig = createServerConfig({
      id: "remote-1",
      name: "Remote MCP",
      transport: "http",
      command: "",
      endpointUrl: "https://remote.example.com/mcp",
    });

    await expect(host.connectServer(httpConfig, { allowedDomains: ["allowed.example.com"] })).rejects.toThrow(
      "Remote MCP endpoint must use HTTPS and match allowed domains."
    );
  });
});

describe("mcp runtime behavior", () => {
  it("handles spawn failure", async () => {
    const host = new McpHost(
      createBridge({
        connectServer: vi.fn(async () => {
          throw new Error("Could not start this MCP server. Check the command and arguments.");
        }),
      })
    );

    await expect(host.connectServer(createServerConfig())).rejects.toThrow("Could not start");
    const status = host.getSnapshot().servers[0];
    expect(status.status).toBe("Error");
  });

  it("handles startup timeout", async () => {
    const host = new McpHost(
      createBridge({
        connectServer: vi.fn(async () => {
          throw new Error("Could not initialize this MCP server: timeout");
        }),
      })
    );

    await expect(host.connectServer(createServerConfig())).rejects.toThrow("timeout");
    expect(host.getSnapshot().servers[0].status).toBe("Error");
  });

  it("connects successfully", async () => {
    const host = new McpHost(
      createBridge({
        connectServer: vi.fn(async () => ({
          serverId: "server-1",
          status: "Connected",
          tools: [
            {
              name: "list_repos",
              description: "List repositories",
              inputSchema: {
                type: "object",
                properties: {},
              },
            },
          ],
          warning: null,
        })),
      })
    );

    await host.connectServer(createServerConfig());
    const snapshot = host.getSnapshot();
    expect(snapshot.servers[0].status).toBe("Connected");
    expect(snapshot.tools).toHaveLength(1);
  });

  it("marks server error if process disconnects during tool call", async () => {
    const host = new McpHost(
      createBridge({
        connectServer: vi.fn(async () => ({
          serverId: "server-1",
          status: "Connected",
          tools: [
            {
              name: "status",
              description: "Server status",
              inputSchema: { type: "object", properties: {} },
            },
          ],
          warning: null,
        })),
        callTool: vi.fn(async () => {
          throw new Error("This MCP server disconnected unexpectedly.");
        }),
      })
    );

    await host.connectServer(createServerConfig());
    const toolName = host.getSnapshot().tools[0].openRouterName;
    await expect(host.callToolByOpenRouterName(toolName, {})).rejects.toThrow("disconnected");
    expect(host.getSnapshot().servers[0].status).toBe("Error");
  });
});

describe("mcp discovery", () => {
  it("discovers valid tool definitions", async () => {
    const host = new McpHost(
      createBridge({
        connectServer: vi.fn(async () => ({
          serverId: "server-1",
          status: "Connected",
          tools: [
            {
              name: "search_docs",
              description: "Search docs",
              inputSchema: { type: "object", properties: { query: { type: "string" } } },
            },
          ],
          warning: null,
        })),
      })
    );

    await host.connectServer(createServerConfig());
    expect(host.getOpenRouterTools()).toHaveLength(1);
  });

  it("rejects malformed tool definitions", async () => {
    const host = new McpHost(
      createBridge({
        connectServer: vi.fn(async () => ({
          serverId: "server-1",
          status: "Connected",
          tools: [
            {
              name: "good_tool",
              description: "ok",
              inputSchema: { type: "object", properties: {} },
            },
            {
              name: "",
              description: "bad",
              inputSchema: { type: "object", properties: {} },
            },
            {
              name: "bad_schema",
              description: "bad",
              inputSchema: "invalid",
            },
          ],
          warning: null,
        })),
      })
    );

    await host.connectServer(createServerConfig());
    expect(host.getSnapshot().tools).toHaveLength(1);
    expect(host.getSnapshot().servers[0].warning).toBeTruthy();
  });

  it("handles duplicate tool naming with safe namespaces", async () => {
    const bridge = createBridge({
      connectServer: vi.fn(async (config: McpServerConfig) => ({
        serverId: config.id,
        status: "Connected",
        tools: [
          {
            name: "search",
            description: "search tool",
            inputSchema: { type: "object", properties: {} },
          },
        ],
        warning: null,
      })),
    });

    const host = new McpHost(bridge);
    await host.connectServer(createServerConfig({ id: "github", name: "GitHub" }));
    await host.connectServer(createServerConfig({ id: "notion", name: "Notion" }));

    const [first, second] = host.getSnapshot().tools;
    expect(first.openRouterName).not.toBe(second.openRouterName);
  });
});

describe("mcp execution", () => {
  it("executes MCP tool successfully", async () => {
    const callTool = vi.fn(async () => ({ result: { repos: 3 } }));
    const host = new McpHost(
      createBridge({
        connectServer: vi.fn(async () => ({
          serverId: "server-1",
          status: "Connected",
          tools: [
            {
              name: "list_repos",
              description: "List repos",
              inputSchema: { type: "object", properties: {} },
            },
          ],
          warning: null,
        })),
        callTool,
      })
    );

    await host.connectServer(createServerConfig());
    const tool = host.getSnapshot().tools[0];
    const result = await host.callToolByOpenRouterName(tool.openRouterName, { owner: "me" });
    expect(result.result).toEqual({ repos: 3 });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("propagates tool timeout", async () => {
    const host = new McpHost(
      createBridge({
        connectServer: vi.fn(async () => ({
          serverId: "server-1",
          status: "Connected",
          tools: [
            {
              name: "slow_tool",
              description: "slow",
              inputSchema: { type: "object", properties: {} },
            },
          ],
          warning: null,
        })),
        callTool: vi.fn(async () => {
          throw new Error("The tool call timed out.");
        }),
      })
    );

    await host.connectServer(createServerConfig());
    const toolName = host.getSnapshot().tools[0].openRouterName;
    await expect(host.callToolByOpenRouterName(toolName, {})).rejects.toThrow("timed out");
  });

  it("propagates tool execution error", async () => {
    const host = new McpHost(
      createBridge({
        connectServer: vi.fn(async () => ({
          serverId: "server-1",
          status: "Connected",
          tools: [
            {
              name: "failing_tool",
              description: "failing",
              inputSchema: { type: "object", properties: {} },
            },
          ],
          warning: null,
        })),
        callTool: vi.fn(async () => {
          throw new Error("Remote MCP error: permission denied.");
        }),
      })
    );

    await host.connectServer(createServerConfig());
    const toolName = host.getSnapshot().tools[0].openRouterName;
    await expect(host.callToolByOpenRouterName(toolName, {})).rejects.toThrow("permission denied");
  });

  it("attaches appView when tool provides ui resource", async () => {
    const host = new McpHost(
      createBridge({
        connectServer: vi.fn(async () => ({
          serverId: "server-1",
          status: "Connected",
          tools: [
            {
              name: "open_board",
              description: "Open board",
              inputSchema: { type: "object", properties: {} },
              appResourceUri: "ui://board/index.html",
            },
          ],
          warning: null,
        })),
        callTool: vi.fn(async () => ({ result: { ok: true } })),
        readResource: vi.fn(async () => ({
          result: {
            contents: [
              {
                uri: "ui://board/index.html",
                mimeType: "text/html",
                text: "<html><body>Board</body></html>",
              },
            ],
          },
        })),
      })
    );

    await host.connectServer(createServerConfig());
    const toolName = host.getSnapshot().tools[0].openRouterName;
    const output = await host.callToolByOpenRouterName(toolName, { title: "demo" });

    expect(output.result).toEqual({ ok: true });
    expect(output.appView?.resourceUri).toBe("ui://board/index.html");
    expect(output.appView?.html).toContain("Board");
  });

  it("attaches appView when tool result returns openai output template uri", async () => {
    const host = new McpHost(
      createBridge({
        connectServer: vi.fn(async () => ({
          serverId: "server-1",
          status: "Connected",
          tools: [
            {
              name: "draw_diagram",
              description: "Draw diagram",
              inputSchema: { type: "object", properties: {} },
            },
          ],
          warning: null,
        })),
        callTool: vi.fn(async () => ({
          result: {
            _meta: {
              "openai/outputTemplate": "ui://excalidraw/app.html",
            },
          },
        })),
        readResource: vi.fn(async () => ({
          result: {
            contents: [
              {
                uri: "ui://excalidraw/app.html",
                mimeType: "text/html",
                text: "<html><body>Excalidraw</body></html>",
              },
            ],
          },
        })),
      })
    );

    await host.connectServer(createServerConfig());
    const toolName = host.getSnapshot().tools[0].openRouterName;
    const output = await host.callToolByOpenRouterName(toolName, {});

    expect(output.appView?.resourceUri).toBe("ui://excalidraw/app.html");
    expect(output.appView?.html).toContain("Excalidraw");
  });

  it("ignores non-ui app resource uri values", async () => {
    const readResource = vi.fn(async () => ({
      result: {
        contents: [
          {
            uri: "https://example.com/app.html",
            mimeType: "text/html",
            text: "<html><body>Should not load</body></html>",
          },
        ],
      },
    }));
    const host = new McpHost(
      createBridge({
        connectServer: vi.fn(async () => ({
          serverId: "server-1",
          status: "Connected",
          tools: [
            {
              name: "open_unsafe_app",
              description: "Open app",
              inputSchema: { type: "object", properties: {} },
            },
          ],
          warning: null,
        })),
        callTool: vi.fn(async () => ({
          result: {
            appResourceUri: "https://example.com/app.html",
          },
        })),
        readResource,
      })
    );

    await host.connectServer(createServerConfig());
    const toolName = host.getSnapshot().tools[0].openRouterName;
    const output = await host.callToolByOpenRouterName(toolName, {});

    expect(output.appView).toBeUndefined();
    expect(readResource).not.toHaveBeenCalled();
  });
});

describe("mcp integration boundaries", () => {
  it("disabled servers do not expose tools", async () => {
    const host = new McpHost(
      createBridge({
        connectServer: vi.fn(async () => ({
          serverId: "server-1",
          status: "Connected",
          tools: [
            {
              name: "tool_a",
              description: "",
              inputSchema: { type: "object", properties: {} },
            },
          ],
          warning: null,
        })),
      })
    );

    await host.syncEnabledServers([createServerConfig({ enabled: false })]);
    expect(host.getOpenRouterTools()).toHaveLength(0);
  });

  it("MCP failures are isolated and other servers still connect", async () => {
    const bridge = createBridge({
      connectServer: vi.fn(async (config: McpServerConfig) => {
        if (config.id === "bad") {
          throw new Error("Could not start this MCP server.");
        }
        return {
          serverId: config.id,
          status: "Connected",
          tools: [
            {
              name: "ok_tool",
              description: "ok",
              inputSchema: { type: "object", properties: {} },
            },
          ],
          warning: null,
        };
      }),
    });

    const host = new McpHost(bridge);
    await host.syncEnabledServers([
      createServerConfig({ id: "bad", name: "Bad Server" }),
      createServerConfig({ id: "good", name: "Good Server" }),
    ]);

    const snapshot = host.getSnapshot();
    const badServer = snapshot.servers.find((server) => server.serverId === "bad");
    const goodServer = snapshot.servers.find((server) => server.serverId === "good");

    expect(badServer?.status).toBe("Error");
    expect(goodServer?.status).toBe("Connected");
    expect(snapshot.tools.length).toBe(1);
  });
});
