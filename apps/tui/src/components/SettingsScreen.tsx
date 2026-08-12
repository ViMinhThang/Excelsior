import { useSlice } from "../store/store.js";
import { selectSettingsDraft } from "../store/selectors.js";
import { useThemeTokens } from "./useThemeTokens.js";
import { textAttrs } from "../platform/opentui/textAttributes.js";
import { maskSecret } from "../lib/text.js";
import type { SettingsField } from "../actions/settings.js";

const FIELD_LABELS: Record<SettingsField, string> = {
  deepseekApiKey: "DeepSeek API key",
  githubToken: "GitHub token",
  agentToolLoopSteps: "Tool loop steps (max turns)",
  autoApproveWorkspaceEdits: "Auto-approve workspace edits",
};

function formatValue(field: SettingsField, value: unknown): string {
  if (field === "deepseekApiKey" || field === "githubToken") {
    return maskSecret(String(value ?? ""));
  }
  if (field === "autoApproveWorkspaceEdits") {
    return value ? "yes" : "no";
  }
  return String(value ?? "");
}

export function SettingsScreen() {
  const draft = useSlice(selectSettingsDraft);
  const tokens = useThemeTokens();
  if (!draft) return null;

  return (
    <box flexDirection="column" width="100%" height="100%" paddingX={1} paddingY={0}>
      <text fg={tokens.highlightHeading} attributes={textAttrs({ bold: true })}>
        Settings
      </text>
      {draft.fields.map((field, index) => {
        const active = index === draft.active;
        const isBool = field === "autoApproveWorkspaceEdits";
        return (
          <box key={field} flexDirection="row" gap={1} width="100%" backgroundColor={active ? tokens.highlightSecondary : undefined} paddingX={0}>
            <text fg={active ? tokens.highlightSelected : tokens.text} attributes={textAttrs({ bold: active })}>
              {active ? "▸ " : "  "}
              {FIELD_LABELS[field]}
            </text>
            <text fg={active ? tokens.highlight : tokens.muted} truncate>
              {isBool ? "" : ":"}
              {" "}
              {formatValue(field, draft.values[field])}
            </text>
          </box>
        );
      })}
      <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
        [↑↓] move [enter] toggle [ctrl+s] save [esc] back
      </text>
    </box>
  );
}
