import React, { memo } from "react";
import { Box, Text } from "ink";
import { SubAgentState } from "../../../types.js";
import ToolMessage from "../chat/ToolMessage.js";
import { TextBlock } from "../shared/FeedRenderer.js";

interface SubAgentDetailProps {
  agent: SubAgentState;
}

const SubAgentDetail: React.FC<SubAgentDetailProps> = ({ agent }) => {
  const statusColor = agent.status === "running" ? "cyan" : agent.status === "error" ? "red" : "green";
  const statusLabel = agent.status === "running" ? "running" : agent.status === "error" ? "error" : "done";
  const hasParts = agent.outputParts && agent.outputParts.length > 0;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color="white">
        ▸ {agent.role} <Text color={statusColor}>· {statusLabel}</Text>
      </Text>
      <Box flexGrow={1} marginTop={1} flexDirection="column">
        {hasParts ? (
          agent.outputParts.map((part, i) => {
            if (part.type === "text") {
              return <TextBlock key={i} text={part.text} />;
            }
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
          agent.fullOutput.split("\n").map((line, i) => (
            <TextBlock key={i} text={line} />
          ))
        )}
      </Box>
    </Box>
  );
};

export default memo(SubAgentDetail);
