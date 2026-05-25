import { randomUUID } from "crypto";
import type { ConfirmBus, ConfirmRequest } from "../runtime/confirmTypes.js";
import type { AgentMode } from "@excelsior/core";

export type ToolCapability =
  | "fs:read"
  | "fs:write"
  | "shell"
  | "network"
  | "git"
  | "sub-agent";

export interface ConfirmCapability {
  getListenerCount(): number;
  request(
    toolName: string,
    args: string,
    metadata?: Partial<Omit<ConfirmRequest, "callId" | "toolName" | "args">>,
  ): Promise<boolean>;
}

export interface RevertCapability {
  captureBeforeWrite(filePath: string, fullPath: string): Promise<void>;
  recordWrite(filePath: string, fullPath: string, expectedContent: string): void;
}

export interface ToolContext {
  capabilities: ReadonlySet<ToolCapability>;
  confirm?: ConfirmCapability;
  abortSignal?: AbortSignal;
  workspaceRoot?: string;
  mode?: AgentMode;
  revert?: RevertCapability;
}

export function createToolContext(options?: {
  abortSignal?: AbortSignal;
  confirmBus?: ConfirmBus;
  workspaceRoot?: string;
  mode?: AgentMode;
  revert?: RevertCapability;
}): ToolContext {
  const capabilities = new Set<ToolCapability>();
  capabilities.add("fs:read");
  capabilities.add("shell");

  const ctx: ToolContext = {
    capabilities,
    abortSignal: options?.abortSignal,
    workspaceRoot: options?.workspaceRoot ?? process.cwd(),
    mode: options?.mode ?? "act",
    revert: options?.revert,
  };

  if (options?.confirmBus) {
    capabilities.add("fs:write");
    ctx.confirm = {
      getListenerCount: () => options.confirmBus!.getListenerCount("request"),
      request: (toolName: string, args: string, metadata = {}) =>
        new Promise<boolean>((resolve) => {
          const callId = randomUUID();
          const unsub = options.confirmBus!.on("response", (resp) => {
            if (resp.callId === callId) {
              unsub();
              resolve(resp.approved);
            }
          });
          options.confirmBus!.emit("request", {
            callId,
            toolName,
            args,
            ...metadata,
          });
        }),
    };
  }

  return ctx;
}
