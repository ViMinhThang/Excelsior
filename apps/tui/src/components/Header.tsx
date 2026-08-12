import { useSlice } from "../store/store.js";
import { selectMeta, selectStatus } from "../store/selectors.js";
import { useThemeTokens } from "./useThemeTokens.js";
import { textAttrs } from "../platform/opentui/textAttributes.js";

export function Header() {
  const meta = useSlice(selectMeta);
  const status = useSlice(selectStatus);
  const tokens = useThemeTokens();
  const modeColor = status.mode === "act" ? tokens.modeHintAct : tokens.modeHintPlan;
  const modeBg = status.mode === "act" ? tokens.modeHintActBg : tokens.modeHintPlanBg;

  return (
    <box flexDirection="row" width="100%" border={["bottom"]} borderStyle="single" borderColor={tokens.border} paddingX={1} paddingY={0}>
      <box flexGrow={1} flexDirection="row" gap={1} minWidth={0}>
        <text fg={tokens.text} attributes={textAttrs({ bold: true })} truncate>
          {meta.workspace.name || meta.workspace.rootPath}
        </text>
        {meta.currentSessionId ? (
          <text fg={tokens.muted} attributes={textAttrs({ dim: true })} truncate>
            {`#${meta.currentSessionId.slice(0, 8)}`}
          </text>
        ) : null}
      </box>
      <box flexDirection="row" gap={1} flexShrink={0}>
        <text fg={modeColor} bg={modeBg} attributes={textAttrs({ bold: true })}>
          {status.mode === "act" ? " ACT " : " PLAN "}
        </text>
        {status.llm.modelName ? (
          <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
            {status.llm.modelName}
          </text>
        ) : null}
        {status.engine === "connecting" ? (
          <text fg={tokens.highlight} attributes={textAttrs({ dim: true })}>
            connecting…
          </text>
        ) : null}
      </box>
    </box>
  );
}
