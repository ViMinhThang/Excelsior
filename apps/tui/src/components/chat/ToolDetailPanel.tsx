import { memo, type FC, type ReactNode } from "react";
import { Box, Text } from "ink";
import type { ProjectedBlock } from "@excelsior/core";
import { theme } from "../../theme.js";
import { formatCliCommand } from "./ToolMessage.js";
import { createToolDisplay } from "../../lib/toolDisplay.js";

interface ToolDetailPanelProps {
  block: ProjectedBlock & { type: "tool-call" };
}

function prettyJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

const DetailSection: FC<{
  title: string;
  children: ReactNode;
}> = ({ title, children }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text color={theme.colors.highlightHeading} bold>{title}</Text>
    <Box paddingLeft={1} flexDirection="column">
      {children}
    </Box>
  </Box>
);

const ToolDetailPanel: FC<ToolDetailPanelProps> = ({ block }) => {
  const display = createToolDisplay({
    toolName: block.toolName,
    toolArgs: block.toolArgs,
    status: block.status,
    content: block.content,
  });

  const cmd = formatCliCommand(block.toolName, block.toolArgs);
  const duration = block.timestamp ? `at ${block.timestamp}` : "";
  const statusGlyph =
    block.status === "completed" ? theme.glyphs.success
    : block.status === "error" ? theme.glyphs.error
    : theme.glyphs.pending;

  const statusColor =
    block.status === "completed" ? theme.colors.success
    : block.status === "error" ? theme.colors.error
    : theme.colors.activity;

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      width={44}
      borderStyle="single"
      borderColor={theme.colors.border}
    >
      <Box flexDirection="row" gap={1}>
        <Text color={theme.colors.highlightBrand} bold>Tool Detail</Text>
        <Text color={theme.colors.muted} dimColor>{display.label}</Text>
      </Box>

      <DetailSection title="Status">
        <Box flexDirection="row" gap={1} paddingLeft={1}>
          <Text color={statusColor}>{statusGlyph}</Text>
          <Text color={statusColor}>{block.status}</Text>
          <Text color={theme.colors.muted} dimColor>{duration}</Text>
        </Box>
      </DetailSection>

      <DetailSection title="Command">
        <Text color={theme.colors.text} wrap="wrap">{cmd}</Text>
      </DetailSection>

      <DetailSection title="Summary">
        <Text color={theme.colors.secondary} wrap="wrap">{display.summary || "-"}</Text>
      </DetailSection>

      {block.toolArgs && (
        <DetailSection title="Arguments">
          <Text color={theme.colors.muted} dimColor wrap="wrap">
            {prettyJson(block.toolArgs)}
          </Text>
        </DetailSection>
      )}

      {block.content && (
        <DetailSection title={`Output (${block.content.split("\n").length} lines)`}>
          <Text color={theme.colors.muted} dimColor wrap="wrap">
            {block.content.split("\n").slice(0, 20).join("\n")}
          </Text>
          {block.content.split("\n").length > 20 && (
            <Text color={theme.colors.muted} dimColor>
              ... ({block.content.split("\n").length - 20} more lines)
            </Text>
          )}
        </DetailSection>
      )}

      <Box marginTop={1}>
        <Text color={theme.colors.muted} dimColor>
          Esc/Ctrl+T close
        </Text>
      </Box>
    </Box>
  );
};

export default memo(ToolDetailPanel);
