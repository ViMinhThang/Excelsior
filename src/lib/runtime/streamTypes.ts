export type StreamPart =
  | {
      type: "text-delta";
      text: string;
    }
  | {
      type: "tool-call";
      toolName?: string;
      name?: string;
      toolCallId: string;
      input?: unknown;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      output?: { type: string; value: unknown };
    }
  | {
      type: "tool-error";
      toolCallId: string;
      toolName?: string;
      error?: unknown;
    };

export function getTextDelta(part: StreamPart): string {
  if (part.type === "text-delta") {
    return part.text;
  }
  return "";
}

export function getToolName(part: StreamPart): string {
  if (part.type === "tool-call") {
    return part.toolName ?? part.name ?? "unknown";
  }
  return "unknown";
}

export function getToolArgs(part: StreamPart): string {
  if (part.type === "tool-call") {
    return JSON.stringify(part.input ?? {});
  }
  return "{}";
}

export function getToolResult(part: StreamPart): string {
  if (part.type === "tool-result") {
    const output = part.output;
    if (!output) return "No result returned";
    return output.type === "text"
      ? String(output.value)
      : JSON.stringify(output);
  }
  if (part.type === "tool-error") {
    const error = part.error;
    return `[Error] ${typeof error === "string" ? error : JSON.stringify(error ?? "Unknown tool error")}`;
  }
  return "";
}
