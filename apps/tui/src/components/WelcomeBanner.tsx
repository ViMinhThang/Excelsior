import { memo } from "react";
import type { ThemeTokens } from "../theme/tokens.js";
import { textAttrs } from "../platform/opentui/textAttributes.js";
import type { MetaState, StatusState } from "../store/types.js";

export interface WelcomeBannerProps {
  tokens: ThemeTokens;
  meta: MetaState;
  status: StatusState;
  width: number;
}

export const WelcomeBanner = memo(function WelcomeBanner({ tokens, meta, status, width }: WelcomeBannerProps) {
  const boxWidth = Math.min(Math.max(20, width - 2), 68);
  const borderLine = "─".repeat(Math.max(4, boxWidth - 2));
  const topBorder = `╭${borderLine}╮`;
  const bottomBorder = `╰${borderLine}╯`;

  const workspaceName = meta.workspace.rootPath || meta.workspace.name || "workspace";
  const modelName = status.llm.modelName || meta.llm.modelName || "DeepSeek";
  const modeLabel = status.mode === "act" ? "ACT (execute tools)" : "PLAN (read-only)";
  const modeColor = status.mode === "act" ? tokens.modeHintAct : tokens.modeHintPlan;

  return (
    <box flexDirection="column" width={width} paddingX={1} paddingY={1}>
      <text fg={tokens.border} width={width} truncate>
        {topBorder}
      </text>
      <text fg={tokens.text} width={width} truncate>
        <span fg={tokens.assistantBorder}>{"│  "}</span>
        <span fg={tokens.highlightBrand} attributes={textAttrs({ bold: true })}>
          {"✳ Excelsior "}
        </span>
        <span fg={tokens.muted} attributes={textAttrs({ dim: true })}>
          {"v2.0 · Claude Code Edition"}
        </span>
      </text>
      <text fg={tokens.text} width={width} truncate>
        <span fg={tokens.assistantBorder}>{"│  "}</span>
        <span fg={tokens.secondary} attributes={textAttrs({ dim: true })}>
          {"Autonomous Local Coding Agent"}
        </span>
      </text>
      <text fg={tokens.assistantBorder} width={width} truncate>
        {`│  ${"─".repeat(Math.max(2, boxWidth - 6))}`}
      </text>
      <text fg={tokens.text} width={width} truncate>
        <span fg={tokens.assistantBorder}>{"│  "}</span>
        <span fg={tokens.muted}>{"Workspace: "}</span>
        <span fg={tokens.text}>{workspaceName}</span>
      </text>
      <text fg={tokens.text} width={width} truncate>
        <span fg={tokens.assistantBorder}>{"│  "}</span>
        <span fg={tokens.muted}>{"Model:     "}</span>
        <span fg={tokens.highlightInline}>{modelName}</span>
        <span fg={tokens.muted}>{"  ·  Mode: "}</span>
        <span fg={modeColor} attributes={textAttrs({ bold: true })}>{modeLabel}</span>
      </text>
      <text fg={tokens.assistantBorder} width={width} truncate>
        {`│  ${"─".repeat(Math.max(2, boxWidth - 6))}`}
      </text>
      <text fg={tokens.text} width={width} truncate>
        <span fg={tokens.assistantBorder}>{"│  "}</span>
        <span fg={tokens.highlight} attributes={textAttrs({ bold: true })}>
          {"Tips:"}
        </span>
      </text>
      <text fg={tokens.text} width={width} truncate>
        <span fg={tokens.assistantBorder}>{"│  "}</span>
        <span fg={tokens.assistantBullet}>{"• "}</span>
        <span fg={tokens.highlightSecondary} attributes={textAttrs({ bold: true })}>
          {"/mode "}
        </span>
        <span fg={tokens.secondary}>{"      Switch between Plan and Act modes"}</span>
      </text>
      <text fg={tokens.text} width={width} truncate>
        <span fg={tokens.assistantBorder}>{"│  "}</span>
        <span fg={tokens.assistantBullet}>{"• "}</span>
        <span fg={tokens.highlightSecondary} attributes={textAttrs({ bold: true })}>
          {"ctrl+p · ctrl+n "}
        </span>
        <span fg={tokens.secondary}>{"Switch / create new session"}</span>
      </text>
      <text fg={tokens.text} width={width} truncate>
        <span fg={tokens.assistantBorder}>{"│  "}</span>
        <span fg={tokens.assistantBullet}>{"• "}</span>
        <span fg={tokens.highlightSecondary} attributes={textAttrs({ bold: true })}>
          {"/sessions "}
        </span>
        <span fg={tokens.secondary}>{"      Manage sessions (switch, create, delete)"}</span>
      </text>
      <text fg={tokens.text} width={width} truncate>
        <span fg={tokens.assistantBorder}>{"│  "}</span>
        <span fg={tokens.assistantBullet}>{"• "}</span>
        <span fg={tokens.highlightSecondary} attributes={textAttrs({ bold: true })}>
          {"/settings "}
        </span>
        <span fg={tokens.secondary}>{"  Configure tokens and limits"}</span>
      </text>
      <text fg={tokens.text} width={width} truncate>
        <span fg={tokens.assistantBorder}>{"│  "}</span>
        <span fg={tokens.assistantBullet}>{"• "}</span>
        <span fg={tokens.highlightSecondary} attributes={textAttrs({ bold: true })}>
          {"/help "}
        </span>
        <span fg={tokens.secondary}>{"      Display all commands and shortcuts"}</span>
      </text>
      <text fg={tokens.border} width={width} truncate>
        {bottomBorder}
      </text>
    </box>
  );
});
