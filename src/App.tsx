import { useEffect } from "react";
import ChatWindow from "./components/ChatWindow";
import InputBar from "./components/InputBar";
import SettingsPanel from "./components/SettingsPanel";
import Sidebar from "./components/Sidebar";
import ToastViewport from "./components/ToastViewport";
import { useChatStore } from "./store/useChatStore";
import { useMcpStore } from "./store/useMcpStore";
import { useSettingsStore } from "./store/useSettingsStore";

function App() {
  const theme = useSettingsStore((state) => state.theme);
  const fontSize = useSettingsStore((state) => state.fontSize);
  const uiScale = useSettingsStore((state) => state.uiScale);
  const mcpServers = useSettingsStore((state) => state.mcpServers);
  const mcpAllowedDomains = useSettingsStore((state) => state.mcpAllowedDomains);
  const createConversation = useChatStore((state) => state.createConversation);
  const syncMcpWithSettings = useMcpStore((state) => state.syncWithSettings);

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
    void syncMcpWithSettings(mcpServers, mcpAllowedDomains);
  }, [mcpServers, mcpAllowedDomains, syncMcpWithSettings]);

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
    </div>
  );
}

export default App;
