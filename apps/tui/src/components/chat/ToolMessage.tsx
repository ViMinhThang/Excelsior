import { memo, type FC } from "react";
import { Box, Text } from "ink";
import StatusIndicator from "./StatusIndicator.js";
import { theme } from "../../theme.js";
import { createToolDisplay } from "../../lib/toolDisplay.js";
import { FileChangePreviewView } from "../../features/fileChangePreview/FileChangePreviewView.js";
import { normalizeToolText } from "../../lib/toolDisplayUtils.js";

interface ToolMessageProps {
  toolName?: string;
  toolArgs?: string;
  status?: "pending" | "completed" | "error";
  content?: string;
  marginTop?: number;
  nested?: boolean;
  expanded?: boolean;
}

const ToolHeader: FC<{ status: "pending" | "completed" | "error"; cmd: string; expandable?: boolean }> = ({ status, cmd, expandable }) => {
  const match = cmd.match(/^([a-zA-Z0-9_-]+)\((.*)\)$/);

  return (
    <Box flexDirection="row" gap={1}>
      <Text color={theme.colors.border}> </Text>
      <StatusIndicator status={status} />
      {match ? (
        <Box flexDirection="row">
          <Text color={theme.colors.highlightBrand} bold>{match[1]}</Text>
          <Text color={theme.colors.muted}>({match[2]})</Text>
        </Box>
      ) : (
        <Text color={theme.colors.muted}>
          {cmd}
        </Text>
      )}
      {expandable && (
        <Text color={theme.colors.muted}>
          (Ctrl+O to expand)
        </Text>
      )}
    </Box>
  );
};

const ToolMessage: FC<ToolMessageProps> = ({
  toolName,
  toolArgs,
  status = "completed",
  content,
  marginTop,
  nested = false,
  expanded = false,
}) => {
  const display = createToolDisplay({ toolName, toolArgs, status, content });
  const cmd = display.command;

  if (!expanded) {
    return (
      <Box marginTop={marginTop} paddingLeft={1} paddingBottom={nested ? 0 : 1} width="100%">
        <Box flexDirection="column" width="100%">
          <ToolHeader status={status} cmd={cmd} expandable />
        </Box>
      </Box>
    );
  }

  if (toolName === "view" || toolName === "ls" || toolName === "glob") {
    return (
      <Box marginTop={marginTop} paddingLeft={1} paddingBottom={nested ? 0 : 1} width="100%">
        <Box flexDirection="column" width="100%">
          <ToolHeader status={status} cmd={cmd} expandable />
          {display.summaryLine && (
            <Box flexDirection="row" paddingLeft={2}>
              <Text color={theme.colors.muted}>
                └── {display.summaryLine}
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  const showCompletion = display.showCompletion !== false;
  const hasDetail = Boolean(
    display.detail || display.resultPreview?.length || display.fileChangePreview,
  );
  const showBody = Boolean(
    display.fileChangePreview
      || (expanded && (hasDetail || (status === "completed" && showCompletion))),
  );

  const innerContent = (
    <Box flexDirection="column" width="100%">
      <ToolHeader status={status} cmd={cmd} />
      {showBody && (
        <Box flexDirection="column" paddingLeft={2} width="100%">
          {display.detail && !display.fileChangePreview ? (
            <Text color={theme.colors.muted}>↳ {display.detail}</Text>
          ) : null}
          {display.fileChangePreview ? (
            <FileChangePreviewView
              command={cmd}
              preview={display.fileChangePreview}
              pending={false}
              focused={expanded}
            />
          ) : (
            normalizeToolText(content).split(/\r?\n/).map((line, index) => {
              const prefix = !display.detail && index === 0 ? "↳ " : "  ";
              return <Text key={`preview_line_${index}`} color={theme.colors.muted}>{prefix}{line}</Text>;
            })
          )}
          {status === "completed" && !hasDetail && showCompletion && (
            <Text color={theme.colors.muted}>↳ Completed</Text>
          )}
        </Box>
      )}
    </Box>
  );

  return (
    <Box marginTop={marginTop} paddingLeft={1} paddingBottom={nested ? 0 : 1} width="100%">
      {innerContent}
    </Box>
  );
};

export default memo(ToolMessage);
