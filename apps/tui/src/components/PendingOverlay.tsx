import { useMemo } from "react";
import { parsePendingFileChangePreview } from "@excelsior/client";
import { useSlice } from "../store/store.js";
import { selectOverlay } from "../store/selectors.js";
import { useThemeTokens } from "./useThemeTokens.js";
import { textAttrs } from "../platform/opentui/textAttributes.js";
import { FileChangePreviewView } from "./diff/FileChangePreviewView.js";
import { useTerminalDimensions } from "@opentui/react";

export function PendingOverlay() {
  const overlay = useSlice(selectOverlay);
  const tokens = useThemeTokens();
  const { width } = useTerminalDimensions();

  const content = useMemo(() => {
    if (overlay.kind === "pending-confirm") {
      return <ConfirmView />;
    }
    if (overlay.kind === "pending-question") {
      return <QuestionView />;
    }
    return null;
  }, [overlay.kind]);

  if (overlay.kind === "none") return null;
  void width;

  return (
    <box flexDirection="column" width="100%" borderStyle="single" borderColor={tokens.highlightSecondary} backgroundColor={tokens.pendingPanel} paddingX={1} paddingY={0}>
      {content}
    </box>
  );
}

function ConfirmView() {
  const overlay = useSlice(selectOverlay);
  const tokens = useThemeTokens();
  const { width } = useTerminalDimensions();
  if (overlay.kind !== "pending-confirm") return null;
  const state = overlay.state;

  const preview = useMemo(
    () =>
      parsePendingFileChangePreview({
        toolName: state.toolName,
        filePath: state.filePath,
        diff: state.diff,
      }),
    [state.toolName, state.filePath, state.diff],
  );

  return (
    <box flexDirection="column" width="100%">
      <text fg={tokens.highlightAction} attributes={textAttrs({ bold: true })}>
        {state.action === "warning" ? "Warning" : "Approve tool call"}
      </text>
      <text fg={tokens.text} wrapMode="char" width={width}>
        <text fg={tokens.toolCommand} attributes={textAttrs({ bold: true })}>
          {state.toolName}
        </text>
        {state.args ? ` ${state.args.replace(/^{|}$/g, "").trim()}` : ""}
      </text>
      {state.warning ? (
        <text fg={tokens.error} wrapMode="char" width={width}>
          {state.warning}
        </text>
      ) : null}
      {preview ? (
        <FileChangePreviewView preview={preview} tokens={tokens} terminalColumns={width} pending hideRemovedRows={false} />
      ) : null}
      <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
        [y] approve [n] deny [a] approve all [esc] dismiss
      </text>
    </box>
  );
}

function QuestionView() {
  const overlay = useSlice(selectOverlay);
  const tokens = useThemeTokens();
  if (overlay.kind !== "pending-question") return null;
  const state = overlay.state;

  return (
    <box flexDirection="column" width="100%">
      <text fg={tokens.highlightHeading} attributes={textAttrs({ bold: true })}>
        Question
      </text>
      <text fg={tokens.text} wrapMode="char" width={80}>
        {state.question}
      </text>
      {state.options.map((option, index) => (
        <text key={option.id} fg={index === state.selected ? tokens.highlightSelected : tokens.muted}>
          {`${index === state.selected ? "▸" : " "} [${index + 1}] ${option.label}`}
          {option.description ? ` — ${option.description}` : ""}
        </text>
      ))}
      {state.allowManual ? (
        <text fg={tokens.highlightSecondary} wrapMode="char" width={80}>
          {`manual: ${state.manual}`}
        </text>
      ) : null}
      <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
        [1-9] select [enter] submit [esc] cancel
      </text>
    </box>
  );
}
