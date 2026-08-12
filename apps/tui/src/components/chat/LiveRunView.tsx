import { memo } from "react";
import type { ThemeTokens } from "../../theme/tokens.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import type { LiveRunState } from "../../store/types.js";
import { liveRunStatusLabel } from "./Transcript.js";

export interface LiveRunViewProps {
  live: LiveRunState | null;
  tokens: ThemeTokens;
  width: number;
  toolsExpanded: boolean;
  terminalColumns: number;
}

export const LiveRunView = memo(
  function LiveRunView({ live, tokens, width, toolsExpanded }: LiveRunViewProps) {
    if (!live) return null;
    const statusLabel = liveRunStatusLabel(live);
    return (
      <box flexDirection="column" width={width} paddingX={1} paddingY={0}>
        <text fg={tokens.activity} attributes={textAttrs({ bold: true })}>
          {statusLabel ? `agent · ${statusLabel}` : "agent"}
        </text>
        {live.text ? (
          <text fg={tokens.assistantText} wrapMode="char" width={width}>
            {live.text}
          </text>
        ) : null}
        {live.tools.length > 0
          ? live.tools.map((tool) => (
              <box key={tool.id} flexDirection="row" gap={1} width={width} backgroundColor={tokens.toolPanel} paddingX={1}>
                <text fg={tool.status === "error" || tool.status === "denied" ? tokens.error : tokens.activity} truncate>
                  {tool.toolName}
                </text>
                <text fg={tokens.toolArgs} attributes={textAttrs({ dim: true })} truncate>
                  {toolsExpanded ? safeArgs(tool.args) : tool.status}
                </text>
              </box>
            ))
          : null}
      </box>
    );
  },
  (prev, next) => prev.live === next.live && prev.toolsExpanded === next.toolsExpanded,
);

function safeArgs(args: unknown): string {
  try {
    if (typeof args === "string") return args.length > 120 ? `${args.slice(0, 120)}…` : args;
    const text = JSON.stringify(args);
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  } catch {
    return String(args);
  }
}
