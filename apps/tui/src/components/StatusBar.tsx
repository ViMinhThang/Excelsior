import { useSlice } from "../store/store.js";
import { selectMeta, selectStatus } from "../store/selectors.js";
import { useThemeTokens } from "./useThemeTokens.js";
import { textAttrs } from "../platform/opentui/textAttributes.js";

function lastPathSegment(path: string): string {
  const cleaned = path.replace(/[\\/]+$/, "");
  const idx = Math.max(cleaned.lastIndexOf("/"), cleaned.lastIndexOf("\\"));
  return idx >= 0 ? cleaned.slice(idx + 1) : cleaned;
}

export function StatusBar() {
  const meta = useSlice(selectMeta);
  const status = useSlice(selectStatus);
  const tokens = useThemeTokens();
  const modeColor = status.mode === "act" ? tokens.modeHintAct : tokens.modeHintPlan;

  return (
    <box flexDirection="row" width="100%" paddingX={1} paddingY={0}>
      <box flexGrow={1} flexDirection="row" gap={1} minWidth={0}>
        {status.engine === "connecting" ? (
          <text fg={tokens.highlight} attributes={textAttrs({ bold: true })}>
            <span fg={tokens.highlightBrand}>{"⠋ "}</span>
            {"connecting…"}
          </text>
        ) : (
          <text fg={modeColor} attributes={textAttrs({ bold: true })}>
            {`[${status.mode === "act" ? "ACT" : "PLAN"}]`}
          </text>
        )}
        {status.busy ? (
          <text fg={tokens.activity} attributes={textAttrs({ bold: true })}>
            {"●"}
          </text>
        ) : null}
        {status.error ? (
          <text fg={tokens.error} wrapMode="char" truncate>
            <span fg={tokens.error} attributes={textAttrs({ bold: true })}>{"✖ "}</span>
            {status.error}
          </text>
        ) : status.notice ? (
          <text fg={tokens.highlight} attributes={textAttrs({ dim: true })} wrapMode="char" truncate>
            <span fg={tokens.highlightSecondary}>{"ℹ "}</span>
            {status.notice}
          </text>
        ) : null}
      </box>
      <box flexDirection="row" gap={1} flexShrink={0}>
        {meta.workspace.rootPath ? (
          <text fg={tokens.muted} attributes={textAttrs({ dim: true })} truncate>
            <span fg={tokens.highlightSecondary}>{"📁 "}</span>
            {lastPathSegment(meta.workspace.rootPath)}
          </text>
        ) : null}
        {status.llm.modelName ? (
          <text fg={tokens.secondary} attributes={textAttrs({ dim: true })}>
            <span fg={tokens.highlightBrand}>{"⚡ "}</span>
            {status.llm.modelName}
          </text>
        ) : null}
      </box>
    </box>
  );
}