import { z } from "zod";
import type { AppSettings } from "./settings.js";
import {
  DEFAULT_AGENT_TOOL_LOOP_STEPS,
  normalizeAgentToolLoopSteps,
} from "./settings.js";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  deepseekApiKey: "",
  githubToken: "",
  agentToolLoopSteps: DEFAULT_AGENT_TOOL_LOOP_STEPS,
  autoReflectionEnabled: false,
  reflectionMemoryEnabled: false,
  autoApproveWorkspaceEdits: false,
};

export const appSettingsSchema = z.object({
  deepseekApiKey: z.coerce.string().default(""),
  githubToken: z.coerce.string().default(""),
  agentToolLoopSteps: z
    .coerce
    .string()
    .transform(normalizeAgentToolLoopSteps)
    .default(DEFAULT_AGENT_TOOL_LOOP_STEPS),
  autoReflectionEnabled: z.coerce.boolean().default(false),
  reflectionMemoryEnabled: z.coerce.boolean().default(false),
  autoApproveWorkspaceEdits: z.coerce.boolean().default(false),
});

export const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rootPath: z.string().min(1),
});

export const sessionSchema = z.object({
  id: z.string().min(1),
  startedAt: z.string().min(1),
  updatedAt: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
  workspaceId: z.string().optional(),
  title: z.string().optional(),
});

export const turnBackupManifestEntrySchema = z.object({
  path: z.string().min(1),
  action: z.enum(["modify", "create"]),
});

export const turnBackupManifestSchema = z.array(turnBackupManifestEntrySchema);

export const reflectionMemoryStateSchema = z.object({
  lastReflectedAt: z.string().optional().catch(undefined),
  lastSummary: z.string().optional().catch(undefined),
  touchedFiles: z.array(z.string()).catch([]),
  reviewedSessionIds: z.array(z.string()).catch([]),
});

export const childRequestSchema = z.object({
  workspaceRoot: z.string().min(1),
  role: z.string().min(1),
  prompt: z.string().min(1),
  settings: appSettingsSchema,
  projectInstructions: z.string().optional(),
  skillsList: z.string().optional(),
});

export const childOutputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text_delta"), delta: z.string() }),
  z.object({ type: z.literal("tool_start"), toolCallId: z.string(), toolName: z.string(), toolArgs: z.string() }),
  z.object({ type: z.literal("tool_update"), toolCallId: z.string(), delta: z.string() }),
  z.object({
    type: z.literal("tool_end"),
    toolCallId: z.string(),
    toolName: z.string(),
    toolArgs: z.string(),
    result: z.string().optional(),
    isError: z.boolean(),
  }),
  z.object({ type: z.literal("final"), content: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type ChildRequest = z.infer<typeof childRequestSchema>;
export type ChildOutput = z.infer<typeof childOutputSchema>;

export function parseModelToolArgs(rawArgs: string): unknown {
  if (!rawArgs?.trim()) return {};
  try {
    return JSON.parse(rawArgs);
  } catch {
    return rawArgs;
  }
}
