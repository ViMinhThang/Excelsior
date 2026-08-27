import { useSlice } from "../store/store.js";
import { selectStatus } from "../store/selectors.js";
import { useThemeTokens } from "./useThemeTokens.js";
import { textAttrs } from "../platform/opentui/textAttributes.js";

export function EngineCrashed() {
  const status = useSlice(selectStatus);
  const tokens = useThemeTokens();
  if (status.engine !== "crashed") return null;

  return (
    <box flexDirection="column" width="100%" borderStyle="single" borderColor={tokens.error} paddingX={1} paddingY={0}>
      <text fg={tokens.error} attributes={textAttrs({ bold: true })}>
        <span fg={tokens.error}>{"💥 "}</span>
        {"Engine Disconnected / Crashed"}
      </text>
      {status.error ? (
        <text fg={tokens.error} wrapMode="char" width={80}>
          <span fg={tokens.border}>{"│ "}</span>
          {status.error}
        </text>
      ) : null}
      <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
        <span fg={tokens.highlight}>{"[r] "}</span>{"Restart engine (turns resume)  "}
        <span fg={tokens.muted}>{"[ctrl+c] Quit"}</span>
      </text>
    </box>
  );
}
