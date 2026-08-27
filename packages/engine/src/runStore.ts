import type { LiveBlock, RunStatus, RunToolState } from "@excelsior/protocol";

export interface RunToolCall extends RunToolState {
  startedAt?: number;
  endedAt?: number;
}

export interface RunStep {
  id: string;
  modelOutput: string;
  toolCalls: RunToolCall[];
}

export interface RunTurn {
  id: string;
  sessionId: string;
  status: RunStatus;
  userContent: string;
  displayContent?: string;
  steps: RunStep[];
  blocks: LiveBlock[];
  error?: string;
  startedAt: number;
}

export function toRunToolState(call: RunToolCall): RunToolState {
  return {
    id: call.id,
    toolName: call.toolName,
    args: call.args,
    status: call.status,
    result: call.result,
    isError: call.isError,
  };
}

export class RunStore {
  private active: RunTurn | null = null;

  get activeTurn(): RunTurn | null {
    return this.active;
  }

  isActive(): boolean {
    return this.active !== null;
  }

  begin(turn: RunTurn): void {
    this.active = turn;
  }

  setStatus(turnId: string, status: RunStatus): void {
    if (this.active?.id !== turnId) return;
    this.active.status = status;
  }

  clear(): void {
    this.active = null;
  }
}
