import { memo, type FC, useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { ProjectedBlock } from "@excelsior/core";
import { theme } from "../../theme.js";

interface SubAgentPickerPanelProps {
  subAgents: (ProjectedBlock & { type: "sub-agent" })[];
  selectedIndex: number;
}

const statusGlyph: Record<string, string> = {
  running: "🌀",
  done: "✔",
  error: "✖",
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
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % 10), 120);
    return () => clearInterval(timer);
  }, []);

  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const currentSpinner = spinnerFrames[frame % spinnerFrames.length];

  if (subAgents.length === 0) {
    return (
      <Box flexDirection="column" marginTop={1} paddingLeft={1}>
        <Text color={theme.colors.highlightHeading} bold>Sub-agent Pipelines</Text>
        <Text color={theme.colors.muted}>No active pipeline branches.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      <Box flexDirection="row" gap={1}>
        <Text color={theme.colors.highlightHeading} bold>╔══ Sub-agent Pipelines</Text>
        <Text color={theme.colors.border}>══════════════════════════════</Text>
      </Box>
      <Text color={theme.colors.muted} dimColor>
        ║  ↑↓ navigate · Enter view detail · Esc close
      </Text>

      {subAgents.map((block, index) => {
        const agent = block.state;
        const isSelected = index === selectedIndex;
        const isLastAgent = index === subAgents.length - 1;

        const mainConnector = isLastAgent ? "╚══ " : "╠══ ";
        const verticalLine = isLastAgent ? "    " : "║   ";

        const connectorColor = isSelected
          ? theme.colors.highlightSelected
          : agent.status === "running"
            ? theme.colors.activity
            : theme.colors.border;

        const customStatusGlyph = agent.status === "running"
          ? currentSpinner
          : statusGlyph[agent.status] || "○";

        let durationStr = "";
        if (agent.startTime && agent.endTime) {
          durationStr = `${Math.round((agent.endTime - agent.startTime) / 1000)}s`;
        } else if (agent.startTime) {
          durationStr = `${Math.round((Date.now() - agent.startTime) / 1000)}s`;
        }

        const maxVisibleTools = 3;
        const displayedTools = agent.toolCalls.slice(-maxVisibleTools);
        const hiddenToolsCount = agent.toolCalls.length - displayedTools.length;

        return (
          <Box key={block.id} flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Text color={connectorColor}>{mainConnector}</Text>
              <Text color={isSelected ? theme.colors.highlightSelected : theme.colors.border}>
                {isSelected ? "›" : " "}
              </Text>
              <Text color={statusColor[agent.status]}>
                [{customStatusGlyph}]
              </Text>
              <Text
                color={isSelected ? theme.colors.highlightSelected : theme.colors.text}
                bold={isSelected}
              >
                {block.role}
              </Text>
              <Text color={theme.colors.muted} dimColor>
                · {agent.status}
                {durationStr ? ` (${durationStr})` : ""}
              </Text>
            </Box>

            {agent.status === "running" && agent.latestLine && (
              <Box flexDirection="row" gap={1}>
                <Text color={theme.colors.border}>{verticalLine}</Text>
                <Text color={theme.colors.border}>╠══ </Text>
                <Text color={theme.colors.activity} italic dimColor>
                  "{agent.latestLine.substring(0, 50).trim()}"
                </Text>
              </Box>
            )}

            {displayedTools.map((tc, tcIndex) => {
              const isLastTool = tcIndex === displayedTools.length - 1 && hiddenToolsCount === 0;
              const toolConnector = isLastTool ? "╚══ " : "╠══ ";

              const toolStatusCol = tc.status === "pending"
                ? theme.colors.activity
                : tc.status === "error"
                  ? theme.colors.error
                  : theme.colors.success;

              const toolStatusChar = tc.status === "pending"
                ? theme.glyphs.pending
                : tc.status === "error"
                  ? theme.glyphs.error
                  : theme.glyphs.success;

              return (
                <Box key={tc.toolCallId} flexDirection="row" gap={1}>
                  <Text color={theme.colors.border}>{verticalLine}</Text>
                  <Text color={theme.colors.border}>{toolConnector}</Text>
                  <Text color={toolStatusCol}>[{toolStatusChar}]</Text>
                  <Text color={theme.colors.muted} dimColor>
                    {tc.toolName}
                  </Text>
                  {tc.toolArgs && (
                    <Text color={theme.colors.muted} dimColor italic>
                      {String(tc.toolArgs).substring(0, 25).trim()}...
                    </Text>
                  )}
                </Box>
              );
            })}

            {hiddenToolsCount > 0 && (
              <Box flexDirection="row" gap={1}>
                <Text color={theme.colors.border}>{verticalLine}</Text>
                <Text color={theme.colors.border}>╚══ </Text>
                <Text color={theme.colors.muted} dimColor italic>
                  ... (+{hiddenToolsCount} more toolcalls)
                </Text>
              </Box>
            )}
          </Box>
        );
      })}

      <Box flexDirection="row" gap={1} marginTop={0}>
        <Text color={theme.colors.border}>╚═══════════════════════════════════</Text>
      </Box>
    </Box>
  );
};

export default memo(SubAgentPickerPanel);
