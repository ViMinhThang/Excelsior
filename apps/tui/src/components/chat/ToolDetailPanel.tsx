import { memo, type FC } from "react";
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
    <Box flexDirection="column" paddingLeft={1} width={40}>
      <Box>
        <Text color={theme.colors.highlightHeading} bold>Tool Detail</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.colors.muted} bold>Status</Text>
        <Box flexDirection="row" gap={1} paddingLeft={1}>
          <Text color={statusColor}>{statusGlyph}</Text>
          <Text color={statusColor}>{block.status}</Text>
          <Text color={theme.colors.muted} dimColor>{duration}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.colors.muted} bold>Command</Text>
        <Box paddingLeft={1}>
          <Text color={theme.colors.text} dimColor wrap="wrap">
            {cmd}
          </Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.colors.muted} bold>Summary</Text>
        <Box paddingLeft={1}>
          <Text color={theme.colors.text} dimColor>
            {display.summary || "-"}
          </Text>
        </Box>
      </Box>

      {block.toolArgs && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.colors.muted} bold>Arguments</Text>
          <Box paddingLeft={1}>
            <Text color={theme.colors.text} dimColor wrap="wrap">
              {prettyJson(block.toolArgs)}
            </Text>
          </Box>
        </Box>
      )}

      {block.content && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.colors.muted} bold>
            Output ({block.content.split("\n").length} lines)
          </Text>
          <Box paddingLeft={1}>
            <Text color={theme.colors.muted} dimColor wrap="wrap">
              {block.content.split("\n").slice(0, 20).join("\n")}
            </Text>
            {block.content.split("\n").length > 20 && (
              <Text color={theme.colors.muted} dimColor>
                ... ({block.content.split("\n").length - 20} more lines)
              </Text>
            )}
          </Box>
        </Box>
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
