import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import type {
  CallToolResult,
  ListResourcesResult,
  ListResourceTemplatesResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTr } from "../lib/i18n";
import { useMcpStore } from "../store/useMcpStore";
import type { ChatAppView, ChatMessage } from "../types/chat";

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const toCallToolResult = (value: unknown): CallToolResult => {
  if (isRecord(value) && Array.isArray(value.content)) {
    return value as CallToolResult;
  }

  return {
    content: [
      {
        type: "text",
        text:
          typeof value === "string"
            ? value
            : value === undefined
              ? ""
              : JSON.stringify(value),
      },
    ],
  };
};

const toReadResourceResult = (value: unknown): ReadResourceResult => {
  if (isRecord(value) && Array.isArray(value.contents)) {
    return value as ReadResourceResult;
  }
  return {
    contents: [],
  };
};

const toListResourcesResult = (value: unknown): ListResourcesResult => {
  if (isRecord(value) && Array.isArray(value.resources)) {
    return value as ListResourcesResult;
  }
  return {
    resources: [],
  };
};

const toListResourceTemplatesResult = (value: unknown): ListResourceTemplatesResult => {
  if (isRecord(value) && Array.isArray(value.resourceTemplates)) {
    return value as ListResourceTemplatesResult;
  }
  return {
    resourceTemplates: [],
  };
};

function McpAppCard({ appView }: { appView: ChatAppView }) {
  const { t } = useTr();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestFromServer = useMcpStore((state) => state.requestFromServer);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    let disposed = false;
    let bridge: AppBridge | null = null;

    const connectBridge = async () => {
      if (disposed || !iframe.contentWindow) {
        return;
      }

      bridge = new AppBridge(
        null,
        { name: "Jessie", version: "0.1.0" },
        {
          openLinks: {},
          serverTools: {},
          serverResources: {},
          logging: {},
          message: { text: {} },
          updateModelContext: { text: {} },
          downloadFile: {},
        }
      );

      bridge.onopenlink = async ({ url }) => {
        window.open(url, "_blank", "noopener,noreferrer");
        return {};
      };

      bridge.oncalltool = async (params) =>
        toCallToolResult(
          await requestFromServer({
            serverId: appView.serverId,
            method: "tools/call",
            params,
            timeoutMs: 15_000,
          })
        );

      bridge.onreadresource = async (params) =>
        toReadResourceResult(
          await requestFromServer({
            serverId: appView.serverId,
            method: "resources/read",
            params,
            timeoutMs: 15_000,
          })
        );

      bridge.onlistresources = async (params) =>
        toListResourcesResult(
          await requestFromServer({
            serverId: appView.serverId,
            method: "resources/list",
            params,
            timeoutMs: 15_000,
          })
        );

      bridge.onlistresourcetemplates = async (params) =>
        toListResourceTemplatesResult(
          await requestFromServer({
            serverId: appView.serverId,
            method: "resources/templates/list",
            params,
            timeoutMs: 15_000,
          })
        );

      await bridge.connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow));
      await bridge.sendToolInput({
        arguments: appView.toolArguments ?? {},
      });
      await bridge.sendToolResult(toCallToolResult(appView.toolResult));
    };

    const onLoad = () => {
      void connectBridge();
    };

    iframe.addEventListener("load", onLoad);
    if (iframe.contentDocument?.readyState === "complete") {
      void connectBridge();
    }

    return () => {
      disposed = true;
      iframe.removeEventListener("load", onLoad);
      if (bridge) {
        void bridge.teardownResource({}).catch(() => {});
        void bridge.close().catch(() => {});
      }
    };
  }, [
    appView.serverId,
    appView.resourceUri,
    appView.html,
    appView.toolResult,
    appView.toolArguments,
    requestFromServer,
    reloadKey,
  ]);

  return (
    <div className="mt-3 rounded-xl border border-[color:var(--border)] bg-[var(--surface-bg)] p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-secondary)]">{appView.title || appView.toolName}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const blob = new Blob([appView.html], { type: "text/html;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              window.open(url, "_blank", "noopener,noreferrer");
              window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
            }}
            className="h-6 rounded-md border border-[color:var(--border)] px-2 text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
          >
            {t("Open", "打开")}
          </button>
          <button
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
            className="h-6 rounded-md border border-[color:var(--border)] px-2 text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
          >
            {t("Reload", "刷新")}
          </button>
        </div>
      </div>

      <iframe
        key={`${appView.serverId}:${appView.resourceUri}:${reloadKey}`}
        ref={iframeRef}
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
        srcDoc={appView.html}
        title={appView.title || appView.toolName}
        className="h-[420px] w-full rounded-lg border border-[color:var(--border)] bg-white"
      />
    </div>
  );
}

function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const content = `${message.content}${isStreaming ? "|" : ""}`;
  const isTyping = !isUser && isStreaming && message.content.trim().length === 0;

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[90%] md:max-w-[88%]">
        <div
          className={`rounded-2xl border px-4 py-3 text-[15px] leading-7 shadow-sm ${
            isUser
              ? "border-transparent bg-[var(--message-user)] text-[var(--text-primary)]"
              : "border-[color:var(--border)] bg-[var(--message-assistant)] text-[var(--text-primary)]"
          }`}
        >
          {isTyping ? (
            <div className="flex items-center gap-1 py-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-secondary)]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-secondary)] [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-secondary)] [animation-delay:240ms]" />
            </div>
          ) : isUser ? (
            <p className="whitespace-pre-wrap break-words">{content}</p>
          ) : (
            <>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="mb-3 list-disc pl-6 last:mb-0">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-3 list-decimal pl-6 last:mb-0">{children}</ol>,
                  li: ({ children }) => <li className="mb-1">{children}</li>,
                  code: ({ className, children }) => {
                    const isBlock = Boolean(className);

                    return isBlock ? (
                      <code className="block overflow-x-auto rounded-xl bg-black/15 p-3 text-[13px]">
                        {children}
                      </code>
                    ) : (
                      <code className="rounded bg-black/10 px-1.5 py-0.5 text-[13px]">{children}</code>
                    );
                  },
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noreferrer" className="text-blue-400 underline">
                      {children}
                    </a>
                  ),
                }}
              >
                {content || " "}
              </ReactMarkdown>
              {message.appView && <McpAppCard appView={message.appView} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;
