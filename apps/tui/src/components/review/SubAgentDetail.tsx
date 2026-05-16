import { memo, type FC } from "react";
import { Box, Text } from "ink";
import type { SubAgentViewModel } from "@excelsior/core";
import ToolMessage from "../chat/ToolMessage.js";
import { MarkdownRenderer } from "../shared/MarkdownRenderer.js";
import { theme } from "../../theme.js";

interface SubAgentDetailProps {
  agent: SubAgentViewModel;
}

const SubAgentDetail: FC<SubAgentDetailProps> = ({ agent }) => {
  const statusColor = agent.status === "running" ? theme.colors.activity : agent.status === "error" ? theme.colors.error : theme.colors.success;
  const statusLabel = agent.status === "running" ? "running" : agent.status === "error" ? "error" : "done";
  const hasParts = agent.outputParts && agent.outputParts.length > 0;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color={theme.colors.text}>
        {theme.glyphs.active} {agent.role} <Text color={statusColor}>{theme.glyphs.section} {statusLabel}</Text>
      </Text>
      <Box flexGrow={1} marginTop={1} flexDirection="column">
        {hasParts ? (
          agent.outputParts.map((part, i) => {
            if (part.type === "text") return <MarkdownRenderer key={i} content={part.text} />;
            return (
              <ToolMessage
                key={i}
                toolName={part.toolName}
                toolArgs={part.toolArgs}
                status={part.status || "completed"}
                content=""
                marginTop={1}
              />
            );
          })
        ) : (
          <MarkdownRenderer content={agent.fullOutput} />
        )}
      </Box>
    </Box>
  );
};

export default memo(SubAgentDetail);
