import { Settings, SquarePen, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useToastStore } from "../store/useToastStore";

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 400;

const formatTime = (timestamp: number) => {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
};

function Sidebar() {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const createConversation = useChatStore((state) => state.createConversation);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);

  const openSettings = useSettingsStore((state) => state.openSettings);
  const sidebarWidth = useSettingsStore((state) => state.sidebarWidth);
  const setSidebarWidth = useSettingsStore((state) => state.setSidebarWidth);
  const pushToast = useToastStore((state) => state.pushToast);

  const [isResizing, setIsResizing] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const confirmPopoverRef = useRef<HTMLDivElement | null>(null);

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations]
  );

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, event.clientX));
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    const originalCursor = document.body.style.cursor;
    const originalUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalUserSelect;
    };
  }, [isResizing, setSidebarWidth]);

  useEffect(() => {
    if (!pendingDeleteId) {
      return;
    }

    const onMouseDown = (event: MouseEvent) => {
      if (!confirmPopoverRef.current) {
        return;
      }

      if (!confirmPopoverRef.current.contains(event.target as Node)) {
        setPendingDeleteId(null);
      }
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [pendingDeleteId]);

  useEffect(() => {
    if (!pendingDeleteId) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPendingDeleteId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingDeleteId]);

  useEffect(() => {
    if (!pendingDeleteId) {
      return;
    }

    const stillExists = conversations.some((conversation) => conversation.id === pendingDeleteId);
    if (!stillExists) {
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, conversations]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.key !== "Backspace" || !activeConversationId) {
        return;
      }

      event.preventDefault();
      setPendingDeleteId(activeConversationId);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeConversationId, deleteConversation]);

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-r border-[color:var(--border)] bg-[var(--panel-bg)] backdrop-blur-xl"
      style={{ width: sidebarWidth }}
    >
      <div className="h-14 border-b border-[color:var(--border)] px-4">
        <div className="flex h-full items-center text-sm font-semibold tracking-wide text-[var(--text-primary)]">
          Jessie
        </div>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto px-2 py-3">
        {sortedConversations.map((conversation) => {
          const isActive = conversation.id === activeConversationId;

          return (
            <div key={conversation.id} className="group relative">
              <button
                type="button"
                onClick={() => setActiveConversation(conversation.id)}
                className={`w-full rounded-xl px-3 py-2 pr-10 text-left transition ${
                  isActive
                    ? "bg-[var(--surface-bg)] shadow-sm ring-1 ring-[color:var(--border)]"
                    : "bg-transparent hover:bg-[var(--surface-muted)]"
                }`}
              >
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">{conversation.title}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{formatTime(conversation.updatedAt)}</p>
              </button>

              <button
                type="button"
                aria-label="Delete chat"
                onClick={(event) => {
                  event.stopPropagation();
                  setPendingDeleteId(conversation.id);
                }}
                className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] opacity-0 transition hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>

              {pendingDeleteId === conversation.id && (
                <div
                  ref={confirmPopoverRef}
                  className="absolute right-2 top-8 z-30 w-56 rounded-lg border border-[color:var(--border)] bg-[var(--panel-bg)] p-2.5 shadow-panel"
                  onClick={(event) => event.stopPropagation()}
                >
                  <p className="text-xs leading-5 text-[var(--text-secondary)]">
                    Are you sure you want to delete this chat?
                  </p>
                  <div className="mt-2 flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(null)}
                      className="h-7 rounded-md border border-[color:var(--border)] bg-[var(--surface-muted)] px-2.5 text-[11px] text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        deleteConversation(conversation.id);
                        setPendingDeleteId(null);
                        pushToast("Chat deleted", "success");
                      }}
                      className="h-7 rounded-md border border-red-400/30 px-2.5 text-[11px] text-red-300 transition hover:bg-red-500/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-[color:var(--border)] p-3">
        <button
          type="button"
          onClick={createConversation}
          className="mb-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--surface-bg)] text-sm font-medium text-[var(--text-primary)] shadow-sm transition hover:-translate-y-px hover:bg-[var(--surface-muted)]"
        >
          <SquarePen size={15} />
          New Chat
        </button>

        <button
          type="button"
          onClick={openSettings}
          aria-label="Open settings"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--surface-bg)] hover:text-[var(--text-primary)]"
        >
          <Settings size={16} />
        </button>
      </div>

      <button
        type="button"
        aria-label="Resize sidebar"
        onMouseDown={(event) => {
          event.preventDefault();
          setIsResizing(true);
        }}
        className="group absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize"
      >
        <span
          className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--border)] transition ${
            isResizing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        />
      </button>
    </aside>
  );
}

export default Sidebar;
