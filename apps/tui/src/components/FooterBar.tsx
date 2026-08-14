import { useSlice } from "../store/store.js";
import { selectFocus, selectStatus } from "../store/selectors.js";
import { useThemeTokens } from "./useThemeTokens.js";
import { textAttrs } from "../platform/opentui/textAttributes.js";

const FOCUS_HINT: Record<string, string> = {
  input: "enter send · tab mode · ctrl+o tools · ctrl+p sessions · ctrl+n new · ctrl+s settings · esc scroll",
  transcript: "↑↓/ctrl+↑↓ scroll · tab mode · ctrl+o tools · ctrl+p sessions · ctrl+n new · esc input",
  overlay: "overlay active — [n] new · [d] delete · [enter] switch · [esc] close",
  settings: "↑↓ select · enter toggle · ctrl+s save · esc back",
  app: "tab mode · ctrl+o tools · ctrl+p sessions · ctrl+n new · ctrl+s settings",
};

export function FooterBar() {
  const status = useSlice(selectStatus);
  const focus = useSlice(selectFocus);
  const tokens = useThemeTokens();

  const hint = FOCUS_HINT[focus] ?? "";

  return (
    <box flexDirection="row" width="100%" border={["top"]} borderStyle="single" borderColor={tokens.border} paddingX={1} paddingY={0}>
      <box flexGrow={1} flexDirection="row" gap={1} minWidth={0}>
        <text fg={tokens.muted} attributes={textAttrs({ dim: true })} wrapMode="char" truncate>
          {hint}
        </text>
      </box>
      <box flexDirection="row" gap={1} flexShrink={0}>
        {status.busy ? (
          <text fg={tokens.activity} attributes={textAttrs({ bold: true })}>
            <span fg={tokens.highlight}>{"● "}</span>
            {"busy"}
          </text>
        ) : null}
        <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
          {status.busy ? "ctrl+c cancel" : "ctrl+c quit"}
        </text>
      </box>
    </box>
  );
}
