import {
  PLAN_MODE_BLOCKED_MESSAGE,
  type AgentMode,
  type AppSettings,
  type AskQuestionRequest,
  type AskQuestionResponse,
  type ConfirmRequest,
  type DiffAction,
  type Workspace,
} from "@excelsior/protocol";
import { InteractionManager } from "./interaction.js";

export type ToolAction =
  | {
      kind: "write-file";
      filePath: string;
      mode: AgentMode;
      action?: DiffAction;
      diff?: string;
      warning?: string;
    }
  | {
      kind: "edit-file";
      filePath: string;
      mode: AgentMode;
      action?: DiffAction;
      diff?: string;
      warning?: string;
    }
  | { kind: "run-command"; command: string; mode: AgentMode }
  | { kind: "read-file" }
  | { kind: "list" }
  | { kind: "search" };

export type PermissionReason =
  | "allowed"
  | "blocked"
  | "needs-approval"
  | "plan-blocked";

export interface PermissionDecision {
  allow: boolean;
  reason: PermissionReason;
}

export interface PermissionPolicy {
  decide(act: ToolAction): PermissionDecision;
  confirm(act: ToolAction, callId: string): Promise<boolean>;
  ask(question: AskQuestionRequest, callId: string): Promise<AskQuestionResponse>;
}

export interface CapabilityContext {
  workspace: Workspace;
  settings: Readonly<AppSettings>;
  mode: AgentMode;
  permission: PermissionPolicy;
  callId: string;
  onOutput?: (delta: string) => void;
  logger: { notice(message: string): void };
}

export interface CapabilityContextFactory {
  (callId: string): CapabilityContext;
}

export function createCapabilityContextFactory(deps: {
  workspace: Workspace;
  settings: () => Readonly<AppSettings>;
  mode: () => AgentMode;
  permission: PermissionPolicy;
  logger: { notice(message: string): void };
}): CapabilityContextFactory {
  return (callId: string): CapabilityContext => ({
    workspace: deps.workspace,
    settings: deps.settings(),
    mode: deps.mode(),
    permission: deps.permission,
    callId,
    logger: deps.logger,
  });
}

export function classifyCommandRisk(
  command: string,
  args: string[],
): { blocked: boolean; writeLike: boolean; message: string } {
  const textCommand = [command, ...args].join(" ").toLowerCase();
  const dangerous = [
    /rm\s+-rf\s+\/$/,
    /rm\s+-rf\s+\/\*/,
    /mkfs/,
    /shutdown/,
    /reboot/,
    /:\(\)\{\s*:\|:&\s*\};:/,
  ];
  if (dangerous.some((pattern) => pattern.test(textCommand))) {
    return { blocked: true, writeLike: false, message: "Blocked dangerous command." };
  }
  const writeLike = /\b(rm|del|move|mv|cp|copy|npm\s+install|git\s+checkout|git\s+reset|git\s+clean|mkdir|rmdir)\b/.test(textCommand);
  return { blocked: false, writeLike, message: "" };
}

function toolNameFor(act: ToolAction): string {
  switch (act.kind) {
    case "write-file":
      return "write";
    case "edit-file":
      return "edit";
    case "run-command":
      return "runCommand";
    default:
      return "tool";
  }
}

function argsFor(act: ToolAction): string {
  switch (act.kind) {
    case "write-file":
    case "edit-file":
      return JSON.stringify({ filePath: act.filePath });
    case "run-command":
      return JSON.stringify({ command: act.command });
    default:
      return "{}";
  }
}

function actRequest(act: ToolAction, callId: string): ConfirmRequest {
  return {
    callId,
    toolName: toolNameFor(act),
    args: argsFor(act),
    filePath: "filePath" in act ? act.filePath : undefined,
    action: "action" in act && act.action ? act.action : "warning",
    diff: "diff" in act ? act.diff : undefined,
    warning: "warning" in act ? act.warning : undefined,
  };
}

export class ActPolicy implements PermissionPolicy {
  constructor(private readonly manager: InteractionManager) {}

  decide(act: ToolAction): PermissionDecision {
    switch (act.kind) {
      case "read-file":
      case "list":
      case "search":
        return { allow: true, reason: "allowed" };
      case "write-file":
      case "edit-file":
        return { allow: false, reason: "needs-approval" };
      case "run-command": {
        const risk = classifyCommandRisk(act.command, []);
        if (risk.blocked) return { allow: false, reason: "blocked" };
        return risk.writeLike
          ? { allow: false, reason: "needs-approval" }
          : { allow: true, reason: "allowed" };
      }
    }
  }

  async confirm(act: ToolAction, callId: string): Promise<boolean> {
    return this.manager.requestConfirmation(actRequest(act, callId));
  }

  async ask(question: AskQuestionRequest, callId: string): Promise<AskQuestionResponse> {
    return this.manager.requestQuestion({ ...question, callId });
  }
}

export class PlanPolicy implements PermissionPolicy {
  decide(act: ToolAction): PermissionDecision {
    switch (act.kind) {
      case "read-file":
      case "list":
      case "search":
        return { allow: true, reason: "allowed" };
      case "write-file":
      case "edit-file":
        return { allow: false, reason: "plan-blocked" };
      case "run-command": {
        const risk = classifyCommandRisk(act.command, []);
        if (risk.blocked) return { allow: false, reason: "blocked" };
        return risk.writeLike
          ? { allow: false, reason: "plan-blocked" }
          : { allow: true, reason: "allowed" };
      }
    }
  }

  async confirm(_act: ToolAction, _callId: string): Promise<boolean> {
    return false;
  }

  async ask(question: AskQuestionRequest, _callId: string): Promise<AskQuestionResponse> {
    return {
      callId: question.callId,
      answer: PLAN_MODE_BLOCKED_MESSAGE,
      isManual: false,
      cancelled: true,
    };
  }
}

export { PLAN_MODE_BLOCKED_MESSAGE };
