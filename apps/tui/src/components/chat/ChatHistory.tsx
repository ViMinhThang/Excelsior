import { memo, type FC, type ReactNode } from "react";
import { Box, Text } from "ink";
import UserMessage from "./UserMessage.js";
import AgentMessage from "./AgentMessage.js";
import ToolMessage from "./ToolMessage.js";
import ReasoningMessage from "./ReasoningMessage.js";
import SubAgentRow from "../../features/review/components/SubAgentRow.js";
import type { ProjectedBlock, SubAgentProjectionPart } from "@excelsior/core";
import { theme } from "../../theme.js";

interface ChatHistoryProps {
  blocks: ProjectedBlock[];
  commandsExpanded?: boolean;
}

function renderBlock(
  block: ProjectedBlock,
  commandsExpanded: boolean,
): ReactNode {
  if (block.type === "user") {
    return <UserMessage key={block.id} content={block.content} timestamp={block.timestamp} />;
  }
  if (block.type === "reasoning") {
    return (
      <ReasoningMessage
        key={block.id}
        content={block.content}
        timestamp={block.timestamp}
      />
    );
  }
  if (block.type === "assistant") {
    return (
      <AgentMessage
        key={block.id}
        content={block.content}
        timestamp={block.timestamp}
      />
    );
  }
  if (block.type === "tool-call") {
    return (
      <ToolMessage
        key={block.id}
        toolName={block.toolName}
        toolArgs={block.toolArgs}
        status={block.status}
        content={block.content}
        expanded={commandsExpanded}
      />
    );
  }
  if (block.type === "sub-agent") {
    const partTools = block.state.parts.filter(
      (part): part is Extract<SubAgentProjectionPart, { type: "tool-call" }> =>
        part.type === "tool-call",
    );
    const toolsCount = partTools.length > 0 ? partTools.length : block.state.toolCalls.length;

    return (
      <Box key={block.id} flexDirection="column">
        <SubAgentRow
          agent={block.state}
          role={block.role}
          isSelected={false}
        />
        {commandsExpanded ? (
          renderSubAgentTools(block)
        ) : (
          <Box paddingLeft={4}>
            <Text color={theme.colors.muted} dimColor>
              └── {toolsCount} tool call{toolsCount !== 1 ? "s" : ""}
            </Text>
          </Box>
        )}
      </Box>
    );
  }
  return null;
}

function renderSubAgentTools(block: ProjectedBlock & { type: "sub-agent" }) {
  const partTools = block.state.parts.filter(
    (part): part is Extract<SubAgentProjectionPart, { type: "tool-call" }> =>
      part.type === "tool-call",
  );
  const tools = partTools.length > 0 ? partTools : block.state.toolCalls;

  if (tools.length === 0) return null;

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {tools.map((tool) => (
        <ToolMessage
          key={tool.toolCallId}
          toolName={tool.toolName}
          toolArgs={tool.toolArgs}
          status={tool.status || "completed"}
          content={tool.content ?? ""}
          nested
          expanded
        />
      ))}
    </Box>
  );
}

const ChatHistory: FC<ChatHistoryProps> = ({
  blocks,
  commandsExpanded = true,
}) => {
  return (
    <Box flexDirection="column">
      {blocks.map((block) => renderBlock(block, commandsExpanded))}
    </Box>
  );
};

export default memo(ChatHistory);
