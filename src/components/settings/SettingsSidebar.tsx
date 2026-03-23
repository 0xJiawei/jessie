import {
  Brain,
  Database,
  FlaskConical,
  Plug,
  Palette,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import { useTr } from "../../lib/i18n";
import type { SettingsTab } from "../../store/useSettingsStore";

interface SettingsSidebarProps {
  activeTab: SettingsTab;
  onChange: (tab: SettingsTab) => void;
}

const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Settings }> = [
  { id: "general", label: "General", icon: Settings },
  { id: "models", label: "Models", icon: SlidersHorizontal },
  { id: "mcp", label: "MCP", icon: Plug },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "data", label: "Data", icon: Database },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "advanced", label: "Advanced", icon: FlaskConical },
];

function SettingsSidebar({ activeTab, onChange }: SettingsSidebarProps) {
  const { t } = useTr();
  return (
    <nav className="w-[220px] shrink-0 border-r border-[color:var(--border)] bg-[var(--panel-bg)] p-3">
      <p className="mb-3 px-2 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {t("Settings", "设置")}
      </p>

      <div className="space-y-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-sm transition ${
                isActive
                  ? "bg-[var(--surface-bg)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon size={15} />
              {t(tab.label, tab.label === "General"
                ? "通用"
                : tab.label === "Models"
                  ? "模型"
                  : tab.label === "Memory"
                    ? "记忆"
                    : tab.label === "Data"
                      ? "数据"
                      : tab.label === "Appearance"
                        ? "外观"
                        : tab.label === "Advanced"
                          ? "高级"
                          : "MCP")}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default SettingsSidebar;
