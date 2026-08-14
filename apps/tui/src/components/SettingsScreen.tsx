import { useSlice } from "../store/store.js";
import { selectSettingsDraft } from "../store/selectors.js";
import { useThemeTokens } from "./useThemeTokens.js";
import { textAttrs } from "../platform/opentui/textAttributes.js";
import { maskSecret } from "../lib/text.js";
import type { SettingsField } from "../actions/settings.js";

const FIELD_LABELS: Record<SettingsField, string> = {
  githubToken: "GitHub token",
  agentToolLoopSteps: "Tool loop steps (max turns)",
  autoApproveWorkspaceEdits: "Auto-approve workspace edits",
};

function formatValue(field: SettingsField, value: unknown): string {
  if (field === "githubToken") {
    return maskSecret(String(value ?? ""));
  }
  if (field === "autoApproveWorkspaceEdits") {
    return value ? "[ON]" : "[OFF]";
  }
  return String(value ?? "");
}

export function SettingsScreen() {
  const draft = useSlice(selectSettingsDraft);
  const tokens = useThemeTokens();
  if (!draft) return null;

  return (
    <box flexDirection="column" width="100%" height="100%" paddingX={1} paddingY={1}>
      <text fg={tokens.highlightHeading} attributes={textAttrs({ bold: true })}>
        <span fg={tokens.highlightBrand}>{"⚙ "}</span>
        {"Settings & Preferences"}
      </text>
      <text fg={tokens.border}>
        {"─".repeat(50)}
      </text>
      {draft.fields.map((field, index) => {
        const active = index === draft.active;
        const isBool = field === "autoApproveWorkspaceEdits";
        const val = formatValue(field, draft.values[field]);
        return (
          <box key={field} flexDirection="row" gap={1} width="100%" paddingX={0}>
            <text fg={active ? tokens.highlightSelected : tokens.text} attributes={textAttrs({ bold: active })}>
              <span fg={active ? tokens.highlightBrand : tokens.muted}>
                {active ? "▸ " : "  "}
              </span>
              {FIELD_LABELS[field]}
            </text>
            <text fg={active ? (isBool && val === "[ON]" ? tokens.success : tokens.highlight) : tokens.muted} truncate>
              {isBool ? "" : ":"}
              {" "}
              {val}
            </text>
          </box>
        );
      })}
      <text fg={tokens.border}>
        {"─".repeat(50)}
      </text>
      <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
        <span fg={tokens.highlight}>{"[↑↓] "}</span>{"Select  "}
        <span fg={tokens.highlight}>{"[enter] "}</span>{"Edit/Toggle  "}
        <span fg={tokens.highlight}>{"[ctrl+s] "}</span>{"Save  "}
        <span fg={tokens.muted}>{"[esc] Back"}</span>
      </text>
    </box>
  );
}
