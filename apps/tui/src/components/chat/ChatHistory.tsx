import { memo, type FC, type ReactNode } from "react";
import UserMessage from "./UserMessage.js";
import AgentMessage from "./AgentMessage.js";
import ToolMessage from "./ToolMessage.js";
import ReasoningMessage from "./ReasoningMessage.js";
import SubAgentRow from "../subAgents/SubAgentRow.js";
import type { ProjectedBlock, ProjectedTurn, SubAgentProjectionPart } from "@excelsior/core";
import { theme } from "../../theme.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";

interface ChatHistoryProps {
  turns: ProjectedTurn[];
  toolsExpanded?: boolean;
}

function renderBlock(
  block: ProjectedBlock,
  toolsExpanded: boolean,
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
        expanded={toolsExpanded}
      />
    );
  }
  if (block.type === "sub-agent") {
    return (
      <box key={block.id} flexDirection="column">
        <SubAgentRow
          agent={block.state}
          role={block.role}
          isSelected={false}
        />
        {renderSubAgentTools(block, toolsExpanded)}
      </box>
    );
  }
  if (block.type === "compaction-boundary") {
    return (
      <box
        key={block.id}
        flexDirection="column"
        marginTop={1}
        marginBottom={1}
        paddingLeft={1}
        paddingRight={1}
        borderStyle="single"
        borderColor={theme.colors.muted}
      >
        <text fg={theme.colors.muted} attributes={textAttrs({ bold: true })}>
          {"--- History Compacted ---"}
        </text>
        <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
          {block.summary}
        </text>
      </box>
    );
  }
  return null;
}

function renderSubAgentTools(
  block: ProjectedBlock & { type: "sub-agent" },
  expanded: boolean,
) {
  const partTools = block.state.parts.filter(
    (part): part is Extract<SubAgentProjectionPart, { type: "tool-call" }> =>
      part.type === "tool-call",
  );
  const tools = partTools.length > 0 ? partTools : block.state.toolCalls;

  if (tools.length === 0) return null;

  const visibleTools = expanded ? tools : tools.slice(-2);

  return (
    <box flexDirection="column" paddingLeft={2}>
      {visibleTools.map((tool) => (
        <ToolMessage
          key={tool.toolCallId}
          toolName={tool.toolName}
          toolArgs={tool.toolArgs}
          status={tool.status || "completed"}
          content={tool.content ?? ""}
          nested
          expanded={expanded}
        />
      ))}
      {!expanded && tools.length > visibleTools.length ? (
        <box paddingLeft={1}>
          <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
            {theme.glyphs.branch} {tools.length - visibleTools.length} earlier{" "}
            {tools.length - visibleTools.length === 1 ? "tool" : "tools"}
          </text>
        </box>
      ) : null}
    </box>
  );
}

const ChatHistory: FC<ChatHistoryProps> = ({
  turns,
  toolsExpanded = false,
}) => {
  return (
    <box flexDirection="column">
      {turns.map((turn) => (
        <box key={turn.id} flexDirection="column">
          {turn.blocks.map((block) => renderBlock(block, toolsExpanded))}
          {turn.status === "failed" && turn.error ? (
            <box paddingLeft={1} marginTop={1}>
              <text fg={theme.colors.error}>
                {`Turn failed: ${turn.error.message}`}
              </text>
            </box>
          ) : null}
        </box>
      ))}
    </box>
  );
};

export default memo(ChatHistory);
