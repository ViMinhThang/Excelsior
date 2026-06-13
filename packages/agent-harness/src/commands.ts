import { SESSION_PICKER_PANEL_ID, type CommandResult, type CommandDefinition } from "@excelsior/core";
import {
  formatHarnessReplayReport,
  formatHarnessTrace,
  type HarnessTraceOptions,
} from "./inspector.js";
import type { AgentHarness, HarnessCommand, ReviewCommandServices } from "./types.js";

export function createBuiltInCommands(input: {
  getDefinitions: () => readonly CommandDefinition[];
  reviewServices?: ReviewCommandServices;
}): HarnessCommand[] {
  return [
    command("help", "core", "Show available commands", "/help", async () => ({
      handled: true,
      message: formatHelp(input.getDefinitions()),
      clearInput: true,
    })),
    command("clear", "core", "Clear chat messages from the screen", "/clear", async (_args, harness) => {
      harness.clear();
      return ok("Chat history cleared from UI.");
    }),
    command("reset", "core", "Delete all harness sessions", "/reset", async (_args, harness) => {
      await harness.deleteAllSessions();
      harness.clear();
      return ok("Harness history reset.");
    }),
    command("settings", "settings", "Open settings", "/settings", async () => ({
      handled: true,
      navigate: "settings",
      clearInput: true,
    })),
    command("session", "session", "Open or manage sessions", "/session [list|new|open|rename|delete]", sessionCommand),
    command("mode", "core", "Switch between Plan and Act modes", "/mode [plan|act]", modeCommand),
    command("accept-edits", "core", "Toggle auto-approval for workspace file edits", "/accept-edits [on|off]", acceptEditsCommand),
    command("compact", "runtime", "Compact current conversation context", "/compact", async (_args, harness) => {
      await harness.compactCurrentSession("manual");
      return { handled: true, clearInput: true };
    }),
    command("reflect", "runtime", "Run or manage background reflection memory", "/reflect [status|stop|on|off]", reflectCommand),
    command("revert", "runtime", "Revert the last completed turn", "/revert", async (_args, harness) => harness.revertLastTurn()),
    command("trace", "runtime", "Inspect harness event timeline", "/trace [all|<turnIdPrefix>]", traceCommand),
    command("replay", "runtime", "Replay and validate current harness events", "/replay", async (_args, harness) => {
      const inspection = harness.inspectCurrentSession();
      return ok(formatHarnessReplayReport(harness.replayCurrentSession(), inspection));
    }),
    command("review", "review", "Review a pull request by number", "/review <prNumber>", async (args, harness) => {
      const prNumber = Number(args[0]);
      if (!Number.isInteger(prNumber)) return ok("Usage: /review <prNumber>");
      if (!input.reviewServices) return ok("GitHub review service is not configured.");
      const diff = await input.reviewServices.fetchPRDiff(prNumber);
      await harness.send({
        content:
          `### NEW CODE REVIEW: PR #${prNumber} ###\n\n` +
          "Perform a comprehensive code review of the diff below. Use focused sub-agents if useful.\n\n" +
          `\`\`\`diff\n${diff}\n\`\`\``,
        mode: harness.getSnapshot().mode,
        displayContent: `Reviewing PR #${prNumber}`,
      });
      return ok(`Running code review on PR #${prNumber}...`);
    }),
    command("review-post", "review", "Post a PR review comment", "/review-post <prNumber> <body...>", async (args) => {
      const prNumber = Number(args[0]);
      const body = args.slice(1).join(" ");
      if (!Number.isInteger(prNumber) || !body) return ok("Usage: /review-post <prNumber> <body...>");
      if (!input.reviewServices) return ok("GitHub review service is not configured.");
      return ok(await input.reviewServices.postPRComment(prNumber, body));
    }),
  ];
}

function command(
  name: string,
  category: string,
  description: string,
  usage: string,
  handler: (args: string[], harness: AgentHarness) => CommandResult | Promise<CommandResult>,
): HarnessCommand {
  return {
    definition: { name, category, description, usage },
    execute: handler,
  };
}

function ok(message: string): CommandResult {
  return { handled: true, message, clearInput: true };
}

function traceCommand(args: string[], harness: AgentHarness): CommandResult {
  const target = args[0]?.trim();
  const options: HarnessTraceOptions = !target
    ? { mode: "latest" }
    : target.toLowerCase() === "all"
      ? { mode: "all" }
      : { mode: "turn", turnIdPrefix: target };

  return ok(formatHarnessTrace(harness.inspectCurrentSession(), options));
}

async function reflectCommand(args: string[], harness: AgentHarness): Promise<CommandResult> {
  const subcommand = args[0]?.toLowerCase();
  if (!subcommand) return harness.startReflection("manual");

  if (subcommand === "status") {
    const state = harness.getSnapshot().reflection;
    const settings = harness.getCatalog().settings;
    return ok([
      `Reflection: ${state.status}`,
      `Auto: ${settings.autoReflectionEnabled ? "on" : "off"}`,
      `Memory context: ${settings.reflectionMemoryEnabled ? "on" : "off"}`,
      `Memory root: ${state.memoryRoot}`,
      `Last run: ${state.lastRunAt ?? "never"}`,
      `Last summary: ${state.lastSummary ?? "none"}`,
      `Touched files: ${state.touchedFiles.length > 0 ? state.touchedFiles.join(", ") : "none"}`,
    ].join("\n"));
  }

  if (subcommand === "stop") {
    harness.cancelReflection();
    return ok("Reflection cancellation requested.");
  }

  if (subcommand === "on" || subcommand === "off") {
    const enabled = subcommand === "on";
    harness.saveSettings({ autoReflectionEnabled: enabled });
    return ok(`Auto reflection ${enabled ? "enabled" : "disabled"}.`);
  }

  if (subcommand === "memory") {
    const value = args[1]?.toLowerCase();
    if (value === "on" || value === "off") {
      const enabled = value === "on";
      harness.saveSettings({ reflectionMemoryEnabled: enabled });
      return ok(`Reflection memory context ${enabled ? "enabled" : "disabled"}.`);
    }
    return ok("Usage: /reflect memory [on|off]");
  }

  return ok("Usage: /reflect [status|stop|on|off|memory on|memory off]");
}

async function sessionCommand(args: string[], harness: AgentHarness): Promise<CommandResult> {
  const subcommand = args[0]?.toLowerCase() ?? "list";
  if (subcommand === "list") {
    return { handled: true, openPanelId: SESSION_PICKER_PANEL_ID, clearInput: true };
  }
  if (subcommand === "new") {
    const title = args.slice(1).join(" ") || "Untitled";
    harness.createSession(title);
    return ok(`Created session: "${title}".`);
  }
  if (subcommand === "open") {
    const id = args[1];
    if (!id) return ok("Usage: /session open <id>");
    await harness.switchSession(id);
    return ok(`Switched to session ${id.slice(0, 8)}...`);
  }
  if (subcommand === "rename") {
    const id = args[1];
    const title = args.slice(2).join(" ");
    if (!id || !title) return ok("Usage: /session rename <id> <title...>");
    harness.renameSession(id, title);
    return ok(`Renamed session to "${title}".`);
  }
  if (subcommand === "delete") {
    const id = args[1];
    if (!id) return ok("Usage: /session delete <id>");
    await harness.deleteSession(id);
    return ok(`Deleted session ${id.slice(0, 8)}...`);
  }
  return ok("Usage: /session [list|new|open|rename|delete]");
}

function modeCommand(args: string[], harness: AgentHarness): CommandResult {
  const mode = args[0]?.toLowerCase();
  if (mode === "plan" || mode === "act") {
    harness.setMode(mode);
    return ok(`Mode set to ${mode}.`);
  }
  const nextMode = harness.toggleMode();
  return ok(`Mode set to ${nextMode}.`);
}

function acceptEditsCommand(args: string[], harness: AgentHarness): CommandResult {
  const arg = args[0]?.toLowerCase();
  const current = harness.getCatalog().settings.autoApproveWorkspaceEdits;
  const enabled = arg === "on" ? true : arg === "off" ? false : !current;
  harness.saveSettings({ autoApproveWorkspaceEdits: enabled });
  return ok(`Auto-approve workspace edits ${enabled ? "enabled" : "disabled"}.`);
}

function formatHelp(definitions: ReadonlyArray<{ name: string; description: string; usage?: string }>): string {
  return definitions
    .map((definition) => `${definition.usage ?? `/${definition.name}`} - ${definition.description}`)
    .join("\n");
}
