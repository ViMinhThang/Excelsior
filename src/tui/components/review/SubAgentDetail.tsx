import React, { memo } from "react";
import { Box, Text } from "ink";
import { SubAgentState } from "../../../types.js";

interface SubAgentDetailProps {
  agent: SubAgentState;
}

const SubAgentDetail: React.FC<SubAgentDetailProps> = ({ agent }) => {
  const statusLabel = agent.status === "running" ? "[● running]" : "[✓ done]";

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold underline color="white">
        ═══ {agent.role} {statusLabel} ════════════════════════════
      </Text>
      <Box flexGrow={1} marginTop={1} flexDirection="column">
        {agent.fullOutput.split("\n").map((line, i) => (
          <Text key={i} color="white">{line}</Text>
        ))}
      </Box>
    </Box>
  );
};

export default memo(SubAgentDetail);
