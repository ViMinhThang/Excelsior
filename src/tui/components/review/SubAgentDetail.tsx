import React, { memo } from "react";
import { Box, Text } from "ink";
import { DisplayBlock, SubAgentDisplayState, SubAgentPart } from "../../../lib/eventTypes.js";
import ToolMessage from "../chat/ToolMessage.js";
import { MarkdownRenderer } from "../shared/MarkdownRenderer.js";
import { theme } from "../../theme.js";

interface SubAgentDetailProps {
  agent: (DisplayBlock & { type: "sub-agent" }) | { role: string; status: string; fullOutput: string; outputParts?: SubAgentPart[]; state?: SubAgentDisplayState };
}

const SubAgentDetail: React.FC<SubAgentDetailProps> = ({ agent }) => {
  if ("type" in agent && agent.type === "sub-agent") {
    // Chat screen format
    const block = agent as DisplayBlock & { type: "sub-agent" };
    const statusColor = block.state.status === "running" ? theme.colors.activity : block.state.status === "error" ? theme.colors.error : theme.colors.success;
    const statusLabel = block.state.status === "running" ? "running" : block.state.status === "error" ? "error" : "done";
    const hasParts = block.state.parts && block.state.parts.length > 0;

    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color={theme.colors.text}>
          {theme.glyphs.active} {block.role} <Text color={statusColor}>{theme.glyphs.section} {statusLabel}</Text>
        </Text>
        <Box flexGrow={1} marginTop={1} flexDirection="column">
          {hasParts ? (
            block.state.parts.map((part, i) => {
              if (part.type === "text") {
                return <MarkdownRenderer key={i} content={part.text} />;
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
            <MarkdownRenderer content={block.state.fullOutput} />
          )}
        </Box>
      </Box>
    );
  }

  // Review screen format (old SubAgentState shape)
  const reviewAgent = agent as { role: string; status: string; fullOutput: string; outputParts?: SubAgentPart[] };
  const statusColor = reviewAgent.status === "running" ? theme.colors.activity : reviewAgent.status === "error" ? theme.colors.error : theme.colors.success;
  const statusLabel = reviewAgent.status === "running" ? "running" : reviewAgent.status === "error" ? "error" : "done";
  const hasParts = reviewAgent.outputParts && reviewAgent.outputParts.length > 0;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color={theme.colors.text}>
        {theme.glyphs.active} {reviewAgent.role} <Text color={statusColor}>{theme.glyphs.section} {statusLabel}</Text>
      </Text>
      <Box flexGrow={1} marginTop={1} flexDirection="column">
        {hasParts ? (
          reviewAgent.outputParts!.map((part, i) => {
            if (part.type === "text") {
              return <MarkdownRenderer key={i} content={part.text} />;
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
          <MarkdownRenderer content={reviewAgent.fullOutput} />
        )}
      </Box>
    </Box>
  );
};

export default memo(SubAgentDetail);
