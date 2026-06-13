import type { LanguageModel } from "ai";
import type { z } from "zod";
import type {
  AgentClientState,
  AgentMode,
  AppSettings,
  AskQuestionResponse,
  CommandDefinition,
  CommandResult,
  ConfirmRequest,
  ConfirmResponse,
  SendOptions,
  Session,
} from "@excelsior/core";
import type { AnyHarnessEvent, HarnessEvent, HarnessEventEmitter } from "./events.js";
import type { ProviderRegistry, ToolRegistry } from "./registries.js";

export type HarnessSettings = AppSettings;
export type HarnessSnapshot = AgentClientState;

export interface HarnessProvider {
  id: string;
  displayName: string;
  modelId: string;
  createModel(settings: HarnessSettings): LanguageModel;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export interface ToolExecutionContext {
  workspaceRoot: string;
  mode: AgentMode;
  abortSignal?: AbortSignal;
  emit?: HarnessEventEmitter;
  settings?: HarnessSettings;
  providers?: ProviderRegistry;
  tools?: ToolRegistry;
  skillsList?: string;
  projectInstructions?: string;
  backupDir?: string;
  confirm(request: Omit<ConfirmRequest, "callId">): Promise<ConfirmResponse>;
  askQuestion(input: {
    question: string;
    options: Array<{ id: string; label: string; description?: string }>;
    allowManual: boolean;
  }): Promise<AskQuestionResponse>;
  sendSubAgent(input: { role: string; prompt: string }): Promise<string>;
}

export interface ToolExecuteOptions {
  toolCallId?: string;
}

export interface HarnessTool<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute(input: TInput, ctx: ToolExecutionContext, options?: ToolExecuteOptions): Promise<ToolResult>;
}

export type HarnessCommandHandler = (
  args: string[],
  harness: AgentHarness,
) => CommandResult | Promise<CommandResult>;

export interface HarnessCommand {
  definition: CommandDefinition;
  execute: HarnessCommandHandler;
}

export interface HarnessExtensionApi {
  registerTool(tool: HarnessTool): void;
  registerCommand(command: HarnessCommand): void;
  registerProvider(provider: HarnessProvider): void;
  onEvent(handler: (event: HarnessEvent) => void): void;
}

export interface HarnessExtension {
  name: string;
  register(api: HarnessExtensionApi): void;
}

export interface ReviewCommandServices {
  fetchPRDiff(prNumber: number): Promise<string>;
  postPRComment(prNumber: number, body: string): Promise<string>;
}

export interface ISkillReader {
  exists(path: string): boolean;
  readDir(path: string): Array<{ name: string; isDirectory(): boolean }>;
  readFile(path: string): string;
}

export interface HarnessConfig {
  workspaceRoot?: string;
  workspaceId?: string;
  dataDir?: string;
  extensions?: HarnessExtension[];
  reviewServices?: ReviewCommandServices;
  skillsReader?: ISkillReader;
}

export interface HarnessCatalog {
  commands: CommandDefinition[];
  settings: HarnessSettings;
}

export interface HarnessInspectionSnapshot {
  session: Session | null;
  events: AnyHarnessEvent[];
  snapshot: HarnessSnapshot;
}

export interface HarnessReplayReport {
  ok: boolean;
  partial: boolean;
  eventCount: number;
  turnCount: number;
  blockCount: number;
  historyCount: number;
  issues: string[];
}

export interface AgentHarness {
  getSnapshot(): HarnessSnapshot;
  getCatalog(): HarnessCatalog;
  inspectCurrentSession(): HarnessInspectionSnapshot;
  replayCurrentSession(): HarnessReplayReport;
  subscribe(listener: () => void): () => void;
  send(input: { content: string; mode: AgentMode; sessionId?: string } & SendOptions): Promise<void>;
  cancel(): void;
  startReflection(trigger: "manual" | "auto"): Promise<CommandResult>;
  cancelReflection(): void;
  clear(): void;
  createSession(title?: string): Session;
  switchSession(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  deleteAllSessions(): Promise<void>;
  renameSession(sessionId: string, title: string): void;
  executeCommand(input: string): Promise<CommandResult>;
  saveSettings(settings: Partial<HarnessSettings>): void;
  respondToConfirmation(callId: string, approved: boolean): void;
  approveAllConfirmations(): void;
  respondToQuestion(response: AskQuestionResponse): void;
  revertLastTurn(): Promise<CommandResult>;
  compactCurrentSession(triggerMode?: "manual" | "auto"): Promise<void>;
  setMode(mode: AgentMode): void;
  toggleMode(): AgentMode;
  dispose(): void;
}

export interface StoredSessionFile {
  session: Session;
  events: AnyHarnessEvent[];
}
