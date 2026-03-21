import { useEffect, useRef, useState } from "react";
import ChatWindow from "./components/ChatWindow";
import InputBar from "./components/InputBar";
import SettingsPanel from "./components/SettingsPanel";
import Sidebar from "./components/Sidebar";
import ToastViewport from "./components/ToastViewport";
import { useChatStore } from "./store/useChatStore";
import { useMcpStore } from "./store/useMcpStore";
import { useSettingsStore } from "./store/useSettingsStore";
import { useToastStore } from "./store/useToastStore";

function App() {
  const theme = useSettingsStore((state) => state.theme);
  const fontSize = useSettingsStore((state) => state.fontSize);
  const uiScale = useSettingsStore((state) => state.uiScale);
  const closeBehavior = useSettingsStore((state) => state.closeBehavior);
  const mcpServers = useSettingsStore((state) => state.mcpServers);
  const setCloseBehavior = useSettingsStore((state) => state.setCloseBehavior);
  const createConversation = useChatStore((state) => state.createConversation);
  const syncMcpWithSettings = useMcpStore((state) => state.syncWithSettings);
  const pushToast = useToastStore((state) => state.pushToast);

  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [closeAction, setCloseAction] = useState<"quit" | "minimize">("minimize");
  const [rememberCloseChoice, setRememberCloseChoice] = useState(false);
  const appWindowRef = useRef<null | { close: () => Promise<void>; minimize: () => Promise<void> }>(null);
  const allowCloseRef = useRef(false);

  useEffect(() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolvedTheme = theme === "system" ? (prefersDark ? "dark" : "light") : theme;

    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.classList.toggle("light", resolvedTheme === "light");
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--font-size-base", `${fontSize}px`);
  }, [fontSize]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        createConversation();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createConversation]);

  useEffect(() => {
    void syncMcpWithSettings(mcpServers);
  }, [mcpServers, syncMcpWithSettings]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const register = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        appWindowRef.current = appWindow;

        unlisten = await appWindow.onCloseRequested(async (event) => {
          if (allowCloseRef.current) {
            return;
          }

          event.preventDefault();

          try {
            if (closeBehavior === "quit") {
              allowCloseRef.current = true;
              await appWindow.close();
              return;
            }

            if (closeBehavior === "minimize") {
              await appWindow.minimize();
              return;
            }

            setCloseAction("minimize");
            setRememberCloseChoice(false);
            setClosePromptOpen(true);
          } catch (error) {
            allowCloseRef.current = false;
            const message = error instanceof Error ? error.message : "Close action failed.";
            pushToast(message, "error");
          }
        });
      } catch {
        // Running outside Tauri window context.
      }
    };

    void register();
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [closeBehavior, pushToast]);

  const runCloseAction = async (action: "quit" | "minimize") => {
    const appWindow = appWindowRef.current;
    if (!appWindow) {
      return;
    }

    if (rememberCloseChoice) {
      setCloseBehavior(action);
      pushToast(`Will ${action === "quit" ? "quit" : "minimize"} on close`, "success");
    }

    if (action === "minimize") {
      await appWindow.minimize();
      setClosePromptOpen(false);
      return;
    }

    allowCloseRef.current = true;
    setClosePromptOpen(false);
    try {
      await appWindow.close();
    } catch (error) {
      allowCloseRef.current = false;
      const message = error instanceof Error ? error.message : "Close action failed.";
      pushToast(message, "error");
    }
  };

  return (
    <div
      className="h-screen w-screen overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]"
      style={{ zoom: uiScale / 100 }}
    >
      <div className="relative flex h-full">
        <Sidebar />

        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.06),_transparent_58%)]" />
          <ChatWindow />
          <InputBar />
        </div>

        <SettingsPanel />
        <ToastViewport />
      </div>

      {closePromptOpen && (
        <div className="fixed inset-0 z-[91] flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-xl border border-[color:var(--border)] bg-[var(--panel-bg)] p-4 shadow-panel">
            <p className="text-sm font-medium text-[var(--text-primary)]">Close Jessie</p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Do you want to quit Jessie or minimize it to the dock?
            </p>

            <div className="mt-3 space-y-1.5">
              <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                <input
                  type="radio"
                  checked={closeAction === "minimize"}
                  onChange={() => setCloseAction("minimize")}
                />
                Minimize
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                <input type="radio" checked={closeAction === "quit"} onChange={() => setCloseAction("quit")} />
                Quit
              </label>
            </div>

            <label className="mt-3 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={rememberCloseChoice}
                onChange={(event) => setRememberCloseChoice(event.target.checked)}
              />
              Remember my choice
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClosePromptOpen(false)}
                className="h-8 rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void runCloseAction(closeAction);
                }}
                className="h-8 rounded-lg border border-[color:var(--border)] bg-[var(--message-user)] px-3 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]"
              >
                {closeAction === "quit" ? "Quit" : "Minimize"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
