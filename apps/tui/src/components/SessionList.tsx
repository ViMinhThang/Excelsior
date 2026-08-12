import { useSlice } from "../store/store.js";
import { selectMeta, selectOverlay } from "../store/selectors.js";
import { useThemeTokens } from "./useThemeTokens.js";
import { textAttrs } from "../platform/opentui/textAttributes.js";

export function SessionList() {
  const overlay = useSlice(selectOverlay);
  const meta = useSlice(selectMeta);
  const tokens = useThemeTokens();
  if (overlay.kind !== "session-list") return null;
  const cursor = overlay.state.cursor;

  return (
    <box flexDirection="column" width="100%" borderStyle="single" borderColor={tokens.highlightSecondary} backgroundColor={tokens.pendingPanel} paddingX={1} paddingY={0}>
      <text fg={tokens.highlightHeading} attributes={textAttrs({ bold: true })}>
        Sessions
      </text>
      {meta.sessions.length === 0 ? (
        <text fg={tokens.muted}>no sessions yet</text>
      ) : (
        meta.sessions.map((session, index) => {
          const selected = index === cursor;
          const current = session.id === meta.currentSessionId;
          return (
            <text key={session.id} fg={selected ? tokens.highlightSelected : tokens.muted}>
              {`${selected ? "▸" : " "} ${current ? "●" : "○"} ${session.metadata.userInput || session.title || session.id}`}
            </text>
          );
        })
      )}
      <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
        [↑↓] move [enter] switch [d] delete [n] new [esc] close
      </text>
    </box>
  );
}
