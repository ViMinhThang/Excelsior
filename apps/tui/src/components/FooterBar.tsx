import { useSlice } from "../store/store.js";
import { selectFocus, selectStatus } from "../store/selectors.js";
import { useThemeTokens } from "./useThemeTokens.js";
import { textAttrs } from "../platform/opentui/textAttributes.js";

const FOCUS_HINT: Record<string, string> = {
  input: "enter send · tab autocomplete · esc blur",
  transcript: "↑↓ scroll · ctrl+f follow · ctrl+o tools · esc input",
  overlay: "overlay — overlay keys active",
  settings: "↑↓ fields · ctrl+s save · esc back",
  app: "ctrl+s settings",
};

export function FooterBar() {
  const status = useSlice(selectStatus);
  const focus = useSlice(selectFocus);
  const tokens = useThemeTokens();

  const hint = FOCUS_HINT[focus] ?? "";

  return (
    <box flexDirection="row" width="100%" border={["top"]} borderStyle="single" borderColor={tokens.border} paddingX={1} paddingY={0}>
      <box flexGrow={1} flexDirection="row" gap={1} minWidth={0}>
        {status.notice ? (
          <text fg={tokens.highlight} attributes={textAttrs({ dim: true })} truncate>
            {status.notice}
          </text>
        ) : status.error ? (
          <text fg={tokens.error} truncate>
            {status.error}
          </text>
        ) : (
          <text fg={tokens.muted} attributes={textAttrs({ dim: true })} truncate>
            {hint}
          </text>
        )}
      </box>
      <box flexDirection="row" gap={1} flexShrink={0}>
        {status.busy ? (
          <text fg={tokens.activity} attributes={textAttrs({ bold: true })}>
            ● busy
          </text>
        ) : null}
        <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
          ctrl+c quit
        </text>
      </box>
    </box>
  );
}
