import { memo } from "react";
import type { ThemeTokens } from "../../theme/tokens.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import type { LiveRunState } from "../../store/types.js";
import { liveRunStatusLabel } from "./Transcript.js";

import { formatToolCommandAndArgs } from "./ToolMessage.js";

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
    const thinking = live.items.length === 0 && (live.status === "running" || live.status === "committing");
    return (
      <box flexDirection="column" width={width} paddingX={1} paddingY={0}>
        {thinking ? (
          <text fg={tokens.activity} attributes={textAttrs({ bold: true })}>
            <span fg={tokens.highlight}>{"⠋ "}</span>
            {"Thinking…"}
          </text>
        ) : (
          live.items.map((item, index) =>
            item.kind === "assistant" ? (
              <text key={index} fg={tokens.assistantText} wrapMode="char" width={width}>
                {item.content}
                <span fg={tokens.highlight} attributes={textAttrs({ bold: true })}>
                  {" ▌"}
                </span>
              </text>
            ) : (
              <box key={item.tool.id} flexDirection="row" gap={1} width={width} paddingX={0}>
                <text fg={item.tool.status === "done" ? tokens.secondary : tokens.highlight} attributes={textAttrs({ bold: true })}>
                  {"●"}
                </text>
                <text fg={tokens.toolCommand} attributes={textAttrs({ bold: true })} truncate>
                  {formatToolCommandAndArgs(item.tool.toolName, item.tool.args)}
                </text>
                <text fg={tokens.toolArgs} wrapMode="char" truncate>
                  {toolsExpanded ? safeArgs(item.tool.args) : `(${item.tool.status})`}
                </text>
                <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
                  {toolsExpanded ? "[-]" : "[ctrl+o]"}
                </text>
              </box>
            ),
          )
        )}
        {!thinking && live.items.length === 0 ? (
          <text fg={tokens.activity} attributes={textAttrs({ bold: true })}>
            <span fg={tokens.highlight}>{"● "}</span>
            {statusLabel ?? "agent"}
          </text>
        ) : null}
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
