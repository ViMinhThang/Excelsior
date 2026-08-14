import { useSlice } from "../store/store.js";
import { selectMeta, selectOverlay } from "../store/selectors.js";
import { useThemeTokens } from "./useThemeTokens.js";
import { textAttrs } from "../platform/opentui/textAttributes.js";

export function SessionList() {
  const overlay = useSlice(selectOverlay);
  const meta = useSlice(selectMeta);
  const tokens = useThemeTokens();
  if (overlay.kind !== "session-list") return null;
  const cursor = Math.min(Math.max(0, overlay.state.cursor), Math.max(0, meta.sessions.length - 1));

  return (
    <box flexDirection="column" width="100%" borderStyle="single" borderColor={tokens.highlightSecondary} paddingX={1} paddingY={0}>
      <text fg={tokens.highlightHeading} attributes={textAttrs({ bold: true })}>
        <span fg={tokens.highlightBrand}>{"💬 "}</span>
        {"Conversation Sessions"}
      </text>
      {meta.sessions.length === 0 ? (
        <text fg={tokens.muted}>no sessions yet</text>
      ) : (
        meta.sessions.map((session, index) => {
          const selected = index === cursor;
          const current = session.id === meta.currentSessionId;
          const title = session.metadata.userInput || session.title || session.id;
          return (
            <text key={session.id} fg={selected ? tokens.highlightSelected : tokens.secondary}>
              <span fg={selected ? tokens.highlight : tokens.muted} attributes={textAttrs({ bold: selected })}>
                {selected ? "▸ " : "  "}
              </span>
              <span fg={current ? tokens.success : tokens.muted}>
                {current ? "● " : "○ "}
              </span>
              <span fg={selected ? tokens.highlightSelected : tokens.text} attributes={textAttrs({ bold: selected })}>
                {title}
              </span>
              {current ? (
                <span fg={tokens.muted} attributes={textAttrs({ dim: true })}>
                  {" (active)"}
                </span>
              ) : null}
            </text>
          );
        })
      )}
      <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
        <span fg={tokens.highlight}>{"[↑↓] "}</span>{"Move  "}
        <span fg={tokens.highlight}>{"[enter] "}</span>{"Switch  "}
        <span fg={tokens.highlight}>{"[d] "}</span>{"Delete  "}
        <span fg={tokens.highlight}>{"[n] "}</span>{"New  "}
        <span fg={tokens.muted}>{"[esc] Close"}</span>
      </text>
    </box>
  );
}
