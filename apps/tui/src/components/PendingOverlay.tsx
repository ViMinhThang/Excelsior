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
    <box flexDirection="column" width="100%" borderStyle="single" borderColor={tokens.highlightSecondary} paddingX={1} paddingY={0}>
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
        <span fg={tokens.highlightBrand}>{"⚠️  "}</span>
        {state.action === "warning" ? "Security Warning" : "Permission Required"}
      </text>
      <text fg={tokens.text} wrapMode="char" width={width}>
        <span fg={tokens.toolCommand} attributes={textAttrs({ bold: true })}>
          {`● ${state.toolName}`}
        </span>
        {state.args ? ` (${state.args.replace(/^{|}$/g, "").trim()})` : ""}
      </text>
      {state.warning ? (
        <text fg={tokens.error} wrapMode="char" width={width}>
          <span fg={tokens.error} attributes={textAttrs({ bold: true })}>{"! "}</span>
          {state.warning}
        </text>
      ) : null}
      {preview ? (
        <FileChangePreviewView preview={preview} tokens={tokens} terminalColumns={width} pending hideRemovedRows={false} />
      ) : null}
      <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
        <span fg={tokens.highlight} attributes={textAttrs({ bold: true })}>{"[y] "}</span>{"Approve  "}
        <span fg={tokens.highlight} attributes={textAttrs({ bold: true })}>{"[n] "}</span>{"Deny  "}
        <span fg={tokens.highlight} attributes={textAttrs({ bold: true })}>{"[a] "}</span>{"Always allow  "}
        <span fg={tokens.muted}>{"[esc] Dismiss"}</span>
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
        <span fg={tokens.highlightBrand}>{"❓ "}</span>
        {"Question"}
      </text>
      <text fg={tokens.text} wrapMode="char" width={80}>
        {state.question}
      </text>
      {state.options.map((option, index) => {
        const selected = index === state.selected;
        return (
          <text key={option.id} fg={selected ? tokens.highlightSelected : tokens.secondary}>
            <span fg={selected ? tokens.highlight : tokens.muted} attributes={textAttrs({ bold: selected })}>
              {`${selected ? "▸ " : "  "}[${index + 1}] `}
            </span>
            {option.label}
            {option.description ? (
              <span fg={tokens.muted} attributes={textAttrs({ dim: true })}>
                {` — ${option.description}`}
              </span>
            ) : null}
          </text>
        );
      })}
      {state.allowManual ? (
        <text fg={tokens.highlightSecondary} wrapMode="char" width={80}>
          <span fg={tokens.muted}>{"Manual: "}</span>
          {state.manual}
        </text>
      ) : null}
      <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
        <span fg={tokens.highlight}>{"[1-9] "}</span>{"Select  "}
        <span fg={tokens.highlight}>{"[enter] "}</span>{"Submit  "}
        <span fg={tokens.muted}>{"[esc] Cancel"}</span>
      </text>
    </box>
  );
}
