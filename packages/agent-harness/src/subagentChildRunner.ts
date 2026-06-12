import { buildSystemPrompt } from "./context/systemPrompt.js";
import {
  MESSAGE_END,
  MESSAGE_UPDATE,
  TOOL_EXECUTION_END,
  TOOL_EXECUTION_START,
  TOOL_EXECUTION_UPDATE,
  makeHarnessEvent,
  type HarnessEventDataMap,
  type HarnessEventEmitter,
} from "./events.js";
import { createDeepSeekProvider } from "./provider.js";
import { ProviderRegistry, ToolRegistry } from "./registries.js";
import { runAgentLoop } from "./run/RunController.js";
import {
  createGlobTool,
  createLsTool,
  createRipgrepTool,
  createViewTool,
} from "./tools/index.js";
import type { HarnessSettings, ToolExecutionContext } from "./types.js";

interface ChildRequest {
  workspaceRoot: string;
  role: string;
  prompt: string;
  settings: HarnessSettings;
  projectInstructions?: string;
  skillsList?: string;
}

type ChildOutput =
  | { type: "text_delta"; delta: string }
  | { type: "tool_start"; toolCallId: string; toolName: string; toolArgs: string }
  | { type: "tool_update"; toolCallId: string; delta: string }
  | { type: "tool_end"; toolCallId: string; toolName: string; toolArgs: string; result: string; isError: boolean }
  | { type: "final"; content: string }
  | { type: "error"; message: string };

function writeOutput(output: ChildOutput): void {
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function createReadOnlyTools(): ToolRegistry {
  const tools = new ToolRegistry();
  for (const tool of [
    createLsTool(),
    createViewTool(),
    createGlobTool(),
    createRipgrepTool(),
  ]) {
    tools.register(tool);
  }
  return tools;
}

function buildChildSystemPrompt(request: ChildRequest): string {
  return `${buildSystemPrompt({
    mode: "plan",
    projectInstructions: request.projectInstructions,
    skillsList: request.skillsList,
  })}

SUBAGENT ROLE: ${request.role}
- You are a spawned child subagent, not the parent orchestrator.
- Complete only the focused task from the parent.
- Use only read-only inspection tools.
- Do not write files, run shell commands, ask the user questions, or spawn more subagents.
- Return concise findings with exact file paths when relevant.`;
}

async function main(): Promise<void> {
  const raw = await readStdin();
  const request = JSON.parse(raw) as ChildRequest;
  const providers = new ProviderRegistry();
  providers.register(createDeepSeekProvider());
  const tools = createReadOnlyTools();
  const ctx: ToolExecutionContext = {
    workspaceRoot: request.workspaceRoot,
    mode: "plan",
    confirm: async (confirmRequest) => ({
      callId: confirmRequest.toolName,
      approved: false,
    }),
    askQuestion: async () => ({
      callId: "subagent-question",
      answer: "",
      isManual: true,
      cancelled: true,
    }),
    sendSubAgent: async () => "Nested subagents are not available inside spawned subagents.",
  };
  let finalContent = "";
  let sequence = 0;
  const emit: HarnessEventEmitter = (type, data) => {
    switch (type) {
      case MESSAGE_UPDATE:
        writeOutput({
          type: "text_delta",
          delta: (data as HarnessEventDataMap[typeof MESSAGE_UPDATE]).delta,
        });
        break;
      case MESSAGE_END: {
        const messageData = data as HarnessEventDataMap[typeof MESSAGE_END];
        if (messageData.message.role === "assistant") {
          finalContent = messageData.message.content;
        }
        break;
      }
      case TOOL_EXECUTION_START: {
        const toolData = data as HarnessEventDataMap[typeof TOOL_EXECUTION_START];
        writeOutput({ type: "tool_start", ...toolData });
        break;
      }
      case TOOL_EXECUTION_UPDATE: {
        const toolData = data as HarnessEventDataMap[typeof TOOL_EXECUTION_UPDATE];
        writeOutput({ type: "tool_update", toolCallId: toolData.toolCallId, delta: toolData.delta });
        break;
      }
      case TOOL_EXECUTION_END: {
        const toolData = data as HarnessEventDataMap[typeof TOOL_EXECUTION_END];
        writeOutput({
          type: "tool_end",
          toolCallId: toolData.toolCallId,
          toolName: toolData.toolName,
          toolArgs: toolData.toolArgs,
          result: toolData.result,
          isError: toolData.isError,
        });
        break;
      }
    }
    return makeHarnessEvent({
      workspaceId: "child_workspace",
      sessionId: "child_session",
      runId: "child_run",
      sequence: ++sequence,
      type,
      data,
    });
  };

  await runAgentLoop({
    messages: [{ role: "user", content: request.prompt }],
    systemPrompt: buildChildSystemPrompt(request),
    settings: {
      ...request.settings,
      agentToolLoopSteps: "200",
    },
    providers,
    tools,
    toolContext: ctx,
    signal: new AbortController().signal,
    emit,
  });
  writeOutput({ type: "final", content: finalContent || "(no output)" });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  writeOutput({ type: "error", message });
  process.exit(1);
});
