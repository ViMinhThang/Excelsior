import React, { memo } from "react";
import { Box, Text } from "ink";
import { SubAgentViewModel } from "../../../lib/projection/display.js";
import ToolMessage from "../chat/ToolMessage.js";
import { MarkdownRenderer } from "../shared/MarkdownRenderer.js";
import { theme } from "../../theme.js";
import { cleanSubAgentRole, getSubAgentStatusDisplay } from "../../lib/subAgentDisplay.js";

interface SubAgentDetailProps {
  agent: SubAgentViewModel;
}

const SubAgentDetail: React.FC<SubAgentDetailProps> = ({ agent }) => {
  const status = getSubAgentStatusDisplay(agent.status);
  const hasParts = agent.outputParts && agent.outputParts.length > 0;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color={theme.colors.text}>
        {theme.glyphs.active} {cleanSubAgentRole(agent.role)} <Text color={status.color}>{theme.glyphs.section} {status.glyph} {status.label}</Text>
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
