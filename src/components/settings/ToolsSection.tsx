import SettingCard from "./SettingCard";
import SettingToggle from "./SettingToggle";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { SectionFeedbackHandlers } from "./types";

function ToolsSection({ onSaved }: SectionFeedbackHandlers) {
  const webSearchToolEnabled = useSettingsStore((state) => state.webSearchToolEnabled);
  const fileUploadEnabled = useSettingsStore((state) => state.fileUploadEnabled);
  const imageInputEnabled = useSettingsStore((state) => state.imageInputEnabled);

  const setWebSearchToolEnabled = useSettingsStore((state) => state.setWebSearchToolEnabled);
  const setFileUploadEnabled = useSettingsStore((state) => state.setFileUploadEnabled);
  const setImageInputEnabled = useSettingsStore((state) => state.setImageInputEnabled);

  return (
    <div className="space-y-4">
      <SettingCard title="Tools" description="MVP toggles for current built-in capabilities.">
        <div className="space-y-2">
          <SettingToggle
            label="Web Search"
            description="Allow Jessie to attach web results"
            checked={webSearchToolEnabled}
            onChange={(value) => {
              setWebSearchToolEnabled(value);
              onSaved();
            }}
          />
          <SettingToggle
            label="File Upload"
            description="Allow text and markdown file uploads"
            checked={fileUploadEnabled}
            onChange={(value) => {
              setFileUploadEnabled(value);
              onSaved();
            }}
          />
          <SettingToggle
            label="Image Input"
            description="Allow image uploads for vision-capable models"
            checked={imageInputEnabled}
            onChange={(value) => {
              setImageInputEnabled(value);
              onSaved();
            }}
          />
        </div>
      </SettingCard>

      <SettingCard title="Future Integrations" description="Reserved for MCP servers and external tools.">
        <div className="rounded-lg border border-dashed border-[color:var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          This section is intentionally simple and ready for future MCP provider configuration.
        </div>
      </SettingCard>
    </div>
  );
}

export default ToolsSection;
