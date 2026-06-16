import { type FC } from "react";
import { useTerminalDimensions } from "@opentui/react";
import type {
  FileChangePreview,
  InlineDiffRow,
} from "@excelsior/core";
import { buildFileChangePreviewFrame } from "@excelsior/core";
import { theme } from "../../theme.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import { highlightCodeLine } from "../../lib/markdown/highlight.js";

type DiffTone = "context" | "removed" | "added" | "empty";

const languageByExtension: Record<string, string> = {
  cjs: "js",
  css: "css",
  html: "html",
  js: "js",
  jsx: "jsx",
  json: "json",
  md: "markdown",
  mjs: "js",
  py: "py",
  ts: "ts",
  tsx: "tsx",
};

function inferLanguage(filePath: string): string | undefined {
  const extension = filePath.split(".").pop()?.toLowerCase();
  return extension ? languageByExtension[extension] : undefined;
}

function diffLineColors(tone: DiffTone): {
  bg?: string;
  text: string;
  gutter: string;
  dim: boolean;
} {
  if (tone === "removed") {
    return {
      bg: theme.colors.diffRemovedBackground,
      text: theme.colors.diffRemovedText,
      gutter: theme.colors.diffRemovedText,
      dim: false,
    };
  }
  if (tone === "added") {
    return {
      bg: theme.colors.diffAddedBackground,
      text: theme.colors.diffAddedText,
      gutter: theme.colors.diffAddedText,
      dim: false,
    };
  }
  return {
    text: theme.colors.diffContextText,
    gutter: theme.colors.diffGutter,
    dim: tone === "context" || tone === "empty",
  };
}

function formatGutter(lineNumber: number | undefined): string {
  const number = lineNumber === undefined ? "    " : String(lineNumber).padStart(4, " ");
  return `${number}   `;
}

const DiffLineRow: FC<{
  row: InlineDiffRow;
  language?: string;
  rowIndex: number;
}> = ({ row, language, rowIndex }) => {
  const colors = diffLineColors(row.tone);
  const gutter = formatGutter(row.lineNumber);
  const text = row.text || " ";

  return (
    <box backgroundColor={colors.bg} width="100%" flexDirection="row">
      <text
        fg={colors.gutter}
        bg={colors.bg}
        attributes={textAttrs({ dim: colors.dim })}
      >
        {gutter}
      </text>
      <text
        fg={colors.text}
        bg={colors.bg}
        attributes={textAttrs({ dim: colors.dim })}
      >
        {highlightCodeLine(text, language, {
          bg: colors.bg,
          fallbackColor: colors.text,
          keyPrefix: `diff_${rowIndex}`,
        })}
      </text>
    </box>
  );
};

const FileChangeInlineView: FC<{
  rows: InlineDiffRow[];
  emptyText?: string;
  language?: string;
}> = ({ rows, emptyText = "", language }) => (
  <box
    flexDirection="column"
    paddingX={0}
    width="100%"
  >
    {rows.length > 0 ? (
      rows.map((row, index) => (
        <DiffLineRow
          key={`inline_${index}`}
          row={row}
          language={language}
          rowIndex={index}
        />
      ))
    ) : (
      <box paddingX={1} paddingY={1}>
        <text fg={theme.colors.muted}>{emptyText}</text>
      </box>
    )}
  </box>
);

const DiffScrollbar: FC<{
  innerHeight: number;
  thumbPosition: number;
}> = ({ innerHeight, thumbPosition }) => (
  <box flexDirection="column" marginLeft={1} marginTop={1}>
    <text fg={theme.colors.diffBorder}>{"\u25b2"}</text>
    {Array.from({ length: innerHeight }).map((_, index) => {
      const isThumb = index === thumbPosition;
      return (
        <text
          key={`thumb_${index}`}
          fg={isThumb ? theme.colors.highlight : theme.colors.diffBorder}
        >
          {isThumb ? "\u2588" : "\u2591"}
        </text>
      );
    })}
    <text fg={theme.colors.diffBorder}>{"\u25bc"}</text>
  </box>
);

export const FileChangePreviewView: FC<{
  preview: FileChangePreview;
  scrollOffset?: number;
  activeHunkIndex?: number;
  hunkCount?: number;
  pending?: boolean;
  focused?: boolean;
  embedded?: boolean;
}> = ({
  preview,
  scrollOffset = 0,
  activeHunkIndex = 0,
  hunkCount = 0,
  pending = false,
  focused = false,
  embedded = false,
}) => {
  const { width } = useTerminalDimensions();
  const hideRemovedRows = preview.action !== "edit";
  const language = inferLanguage(preview.filePath);
  const frame = buildFileChangePreviewFrame({
    preview,
    terminalColumns: width || 180,
    scrollOffset,
    pending,
    focused,
    hideRemovedRows,
  });

  const actionText = preview.action === "edit" ? "Edit" : "Write";
  const hunkInfo = pending && hunkCount > 0
    ? ` \u00b7 Hunk ${activeHunkIndex + 1}/${hunkCount}`
    : "";
  const emptyOldText = preview.action === "create" ? "(empty file)" : "";

  const expandHint = embedded && !focused
    ? `${theme.glyphs.branch} +${preview.added} -${preview.removed} lines changed \u00b7 Ctrl+O to expand`
    : `${theme.glyphs.branch} +${preview.added} -${preview.removed} lines changed \u00b7 Press Ctrl+O to inspect`;

  return (
    <box flexDirection="column" marginTop={embedded ? 0 : 1} width="100%">
      {!embedded ? (
        <box
          flexDirection="row"
          gap={1}
          paddingBottom={0}
          width="100%"
        >
          <text
            fg={pending ? theme.colors.highlightAction : theme.colors.border}
            attributes={textAttrs({ bold: true })}
          >
            {"\u25c6"}
          </text>
          <text fg={theme.colors.text} attributes={textAttrs({ bold: true })}>
            {actionText}
          </text>
          <text fg={theme.colors.highlightPriority} attributes={textAttrs({ bold: true })}>
            {preview.filePath}
          </text>
          {hunkInfo ? (
            <text fg={theme.colors.muted}>{hunkInfo}</text>
          ) : null}
          <text fg={theme.colors.diffAddedText}>+{preview.added}</text>
          <text fg={theme.colors.diffRemovedText}>-{preview.removed}</text>
        </box>
      ) : null}

      <box flexDirection="row" gap={0} marginTop={0} width="100%">
        <box flexGrow={1} flexShrink={1} minWidth={0}>
          <FileChangeInlineView
            rows={frame.inlineRows}
            emptyText={emptyOldText}
            language={language}
          />
        </box>
      </box>

      {frame.isCapped ? (
        <box marginTop={embedded ? 0 : 1}>
          <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
            {expandHint}
          </text>
        </box>
      ) : null}
    </box>
  );
};
