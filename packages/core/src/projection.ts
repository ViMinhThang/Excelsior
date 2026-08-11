export type ToolCallStatus = "pending" | "completed" | "error";

export type ProjectedTaskStatus = "todo" | "in-progress" | "done";

export interface ProjectedTask {
  id: string;
  text: string;
  status: ProjectedTaskStatus;
}

export interface ToolCallInfo {
  toolName: string;
  toolArgs: string;
  toolCallId: string;
  status: ToolCallStatus;
  content?: string;
}

export type ProjectedBlock =
  | {
      type: "user";
      id: string;
      content: string;
      timestamp: string;
      isFrozen?: true;
    }
  | {
      type: "assistant";
      id: string;
      content: string;
      timestamp: string;
      isFrozen?: true;
    }
  | {
      type: "tool-call";
      id: string;
      toolName: string;
      toolArgs: string;
      status: ToolCallStatus;
      content: string;
      timestamp: string;
      isFrozen?: true;
    }
  | {
      type: "sub-agent";
      id: string;
      role: string;
      state: ProjectedSubAgent;
      timestamp: string;
      isFrozen?: true;
    }
  | {
      type: "compaction-boundary";
      id: string;
      summary: string;
      timestamp: string;
    };

export interface ProjectedTurn {
  id: string;
  status: "in-progress" | "completed" | "interrupted" | "failed";
  blocks: ProjectedBlock[];
  error?: { message: string };
  startTime?: string;
  endTime?: string;
  sawCompaction?: boolean;
}

export interface ProjectedSubAgent {
  status: "running" | "done" | "error";
  latestLine: string;
  fullOutput: string;
  toolCalls: ToolCallInfo[];
  parts: SubAgentProjectionPart[];
  startTime?: number;
  endTime?: number;
}

export type SubAgentProjectionPart =
  | { type: "text"; text: string }
  | {
      type: "tool-call";
      toolName: string;
      toolArgs: string;
      toolCallId: string;
      status: ToolCallStatus;
      content?: string;
    };
