import { memo, type FC } from "react";
import type { SubAgentViewModel } from "@excelsior/core";
import ToolMessage from "../chat/ToolMessage.js";
import { MarkdownRenderer } from "../shared/MarkdownRenderer.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import { theme } from "../../theme.js";

interface SubAgentDetailProps {
  agent: SubAgentViewModel;
  showToolCalls?: boolean;
}

const SubAgentDetail: FC<SubAgentDetailProps> = ({
  agent,
  showToolCalls = true,
}) => {
  const statusColor = agent.status === "running" ? theme.colors.activity : agent.status === "error" ? theme.colors.error : theme.colors.success;
  const statusLabel = agent.status === "running" ? "running" : agent.status === "error" ? "error" : "done";
  const visibleParts = agent.outputParts?.filter((part) =>
    showToolCalls || part.type !== "tool-call"
  ) ?? [];
  const hasParts = visibleParts.length > 0;

  return (
    <box flexDirection="column" flexGrow={1}>
      <text fg={theme.colors.highlightHeading} attributes={textAttrs({ bold: true })}>
        {theme.glyphs.active} {agent.role} <text fg={statusColor}>{theme.glyphs.section} {statusLabel}</text>
      </text>
      <box flexGrow={1} marginTop={1} flexDirection="column">
        {hasParts ? (
          visibleParts.map((part, i) => {
            if (part.type === "text") {
              return (
                <MarkdownRenderer
                  key={i}
                  content={part.text}
                  textColor={theme.colors.assistantText}
                  emphasisColor={theme.colors.highlight}
                  alternateEmphasisColor={theme.colors.highlightSecondary}
                />
              );
            }
            return (
              <ToolMessage
                key={i}
                toolName={part.toolName}
                toolArgs={part.toolArgs}
                status={part.status || "completed"}
                content=""
                marginTop={0}
                nested
                expanded
              />
            );
          })
        ) : (
          <MarkdownRenderer
            content={agent.fullOutput}
            textColor={theme.colors.assistantText}
            emphasisColor={theme.colors.highlight}
            alternateEmphasisColor={theme.colors.highlightSecondary}
          />
        )}
      </box>
    </box>
  );
};

export default memo(SubAgentDetail);
