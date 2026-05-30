import type { AgentMode } from "@excelsior/core";
import type {
  AskQuestionOption,
  AskQuestionRequest,
  AskQuestionResponse,
  ConfirmRequest,
  ConfirmResponse,
} from "@excelsior/core";
import {
  requestBlockingPrompt,
  type ConfirmPromptBus,
  type QuestionPromptBus,
} from "../../../runtime/blockingPrompt.js";

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

export interface QuestionCapability {
  getListenerCount(): number;
  request(input: {
    question: string;
    options: AskQuestionOption[];
    allowManual: boolean;
  }): Promise<AskQuestionResponse>;
}

export interface RevertCapability {
  captureBeforeWrite(filePath: string, fullPath: string): Promise<void>;
  recordWrite(filePath: string, fullPath: string, expectedContent: string): void;
}

export interface ToolContext {
  capabilities: ReadonlySet<ToolCapability>;
  confirm?: ConfirmCapability;
  question?: QuestionCapability;
  abortSignal?: AbortSignal;
  workspaceRoot?: string;
  mode?: AgentMode;
  revert?: RevertCapability;
}

export function createToolContext(options?: {
  abortSignal?: AbortSignal;
  confirmBus?: ConfirmPromptBus;
  questionBus?: QuestionPromptBus;
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
        requestBlockingPrompt<ConfirmRequest, ConfirmResponse, boolean>({
          bus: options.confirmBus!,
          buildRequest: (callId) => ({
            callId,
            toolName,
            args,
            ...metadata,
          }),
          mapResponse: (response) => response.approved,
        }),
    };
  }

  if (options?.questionBus) {
    ctx.question = {
      getListenerCount: () => options.questionBus!.getListenerCount("request"),
      request: (input) =>
        requestBlockingPrompt<AskQuestionRequest, AskQuestionResponse>({
          bus: options.questionBus!,
          buildRequest: (callId) => ({ callId, ...input }),
          mapResponse: (response) => response,
          abortSignal: options.abortSignal,
          buildCancelledResponse: (callId) => ({
            callId,
            answer: "",
            isManual: true,
            cancelled: true,
          }),
        }),
    };
  }

  return ctx;
}
