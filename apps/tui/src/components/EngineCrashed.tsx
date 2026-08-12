import { useSlice } from "../store/store.js";
import { selectStatus } from "../store/selectors.js";
import { useThemeTokens } from "./useThemeTokens.js";
import { textAttrs } from "../platform/opentui/textAttributes.js";

export function EngineCrashed() {
  const status = useSlice(selectStatus);
  const tokens = useThemeTokens();
  if (status.engine !== "crashed") return null;

  return (
    <box flexDirection="column" width="100%" borderStyle="single" borderColor={tokens.error} backgroundColor={tokens.pendingPanel} paddingX={1} paddingY={0}>
      <text fg={tokens.error} attributes={textAttrs({ bold: true })}>
        Engine crashed
      </text>
      {status.error ? (
        <text fg={tokens.error} wrapMode="char" width={80}>
          {status.error}
        </text>
      ) : null}
      <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
        [r] restart engine (committed turns resume) [ctrl+c] quit
      </text>
    </box>
  );
}
