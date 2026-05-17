import { memo, type FC } from "react";
import { Box, Text } from "ink";
import type { ProjectedBlock } from "@excelsior/core";
import { theme } from "../../theme.js";

interface SubAgentPickerPanelProps {
  subAgents: (ProjectedBlock & { type: "sub-agent" })[];
  selectedIndex: number;
}

const statusGlyph: Record<string, string> = {
  running: theme.glyphs.pending,
  done: " ",
  error: theme.glyphs.error,
};

const statusColor: Record<string, string> = {
  running: theme.colors.activity,
  done: theme.colors.success,
  error: theme.colors.error,
};

const SubAgentPickerPanel: FC<SubAgentPickerPanelProps> = ({
  subAgents,
  selectedIndex,
}) => {
  if (subAgents.length === 0) {
    return (
      <Box flexDirection="column" marginTop={1} paddingLeft={1}>
        <Text color={theme.colors.highlightHeading} bold>Sub-agents</Text>
        <Text color={theme.colors.muted}>No sub-agents yet.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      <Text color={theme.colors.highlightHeading} bold>Sub-agents</Text>
      <Text color={theme.colors.muted} dimColor>
        ↑↓ navigate · Enter view detail · Esc close
      </Text>
      {subAgents.map((block, index) => {
        const agent = block.state;
        const isSelected = index === selectedIndex;
        const toolCount = agent.toolCalls.length;
        return (
          <Box key={block.id} flexDirection="row" gap={1} marginTop={0}>
            <Text color={isSelected ? theme.colors.highlightSelected : theme.colors.border}>
              {isSelected ? "›" : " "}
            </Text>
            <Text color={statusColor[agent.status]}>
              {statusGlyph[agent.status] || " "}
            </Text>
            <Text
              color={isSelected ? theme.colors.highlightSelected : theme.colors.text}
              bold={isSelected}
            >
              {block.role}
            </Text>
            <Text color={theme.colors.muted} dimColor>
              · {agent.status}{toolCount > 0 ? ` · ${toolCount} tool${toolCount !== 1 ? "s" : ""}` : ""}
              {agent.startTime && agent.endTime
                ? ` · ${Math.round((agent.endTime - agent.startTime) / 1000)}s`
                : agent.startTime
                  ? ` · ${Math.round((Date.now() - agent.startTime) / 1000)}s`
                  : ""}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};

export default memo(SubAgentPickerPanel);
