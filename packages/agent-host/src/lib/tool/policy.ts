import { PLAN_MODE_BLOCKED_MESSAGE } from "@excelsior/core";
import type { ConfirmRequest } from "../runtime/confirmTypes.js";
import type { ToolCapability, ToolContext } from "./context.js";

export type ToolModePolicy = "read" | "write" | "shell";
export type ToolRisk = "low" | "medium" | "high" | "blocked";

export interface ToolConfirmationRequest {
  toolName: string;
  args: string;
  metadata?: Partial<Omit<ConfirmRequest, "callId" | "toolName" | "args">>;
}

export interface ToolActionRequest {
  toolName: string;
  capability?: ToolCapability;
  modePolicy: ToolModePolicy;
  risk?: ToolRisk;
  confirmation?: ToolConfirmationRequest;
}

export type ToolAuthorizationResult =
  | { allowed: true }
  | { allowed: false; message: string };

export async function authorizeToolAction(
  ctx: ToolContext | undefined,
  request: ToolActionRequest,
): Promise<ToolAuthorizationResult> {
  if (request.capability && ctx?.capabilities && !ctx.capabilities.has(request.capability)) {
    return { allowed: false, message: `Missing tool capability: ${request.capability}` };
  }

  if (ctx?.mode === "plan" && request.modePolicy === "write") {
    return { allowed: false, message: PLAN_MODE_BLOCKED_MESSAGE };
  }

  const confirmation = request.confirmation;
  if (confirmation && ctx?.confirm && ctx.confirm.getListenerCount() > 0) {
    const approved = await ctx.confirm.request(
      confirmation.toolName,
      confirmation.args,
      confirmation.metadata,
    );
    if (!approved) return { allowed: false, message: "Denied by user." };
  }

  return { allowed: true };
}
