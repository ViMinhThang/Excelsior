import { randomUUID } from "crypto";
import type { ConfirmBus } from "../runtime/confirmTypes.js";

export type ToolCapability =
  | "fs:read"
  | "fs:write"
  | "shell"
  | "network"
  | "git"
  | "sub-agent";

export interface ConfirmCapability {
  getListenerCount(): number;
  request(toolName: string, args: string): Promise<boolean>;
}

export interface ToolContext {
  capabilities: ReadonlySet<ToolCapability>;
  confirm?: ConfirmCapability;
  abortSignal?: AbortSignal;
  workspaceRoot?: string;
}

export function createToolContext(options?: {
  abortSignal?: AbortSignal;
  confirmBus?: ConfirmBus;
  workspaceRoot?: string;
}): ToolContext {
  const capabilities = new Set<ToolCapability>();
  capabilities.add("fs:read");
  capabilities.add("shell");

  const ctx: ToolContext = {
    capabilities,
    abortSignal: options?.abortSignal,
    workspaceRoot: options?.workspaceRoot ?? process.cwd(),
  };

  if (options?.confirmBus) {
    capabilities.add("fs:write");
    ctx.confirm = {
      getListenerCount: () => options.confirmBus!.getListenerCount("request"),
      request: (toolName: string, args: string) =>
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
          });
        }),
    };
  }

  return ctx;
}
