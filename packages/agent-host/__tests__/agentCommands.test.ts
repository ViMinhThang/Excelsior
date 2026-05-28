import { describe, expect, it, vi } from "vitest";
import type { Session } from "@excelsior/core";
import {
  AgentCommandExecutor,
  type AgentCommandApplication,
} from "@excelsior/agent-host/commands";

function testSession(title = "Test session"): Session {
  return {
    id: "ses_test",
    startedAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z",
    metadata: { userInput: "test" },
    workspaceId: "ws_test",
    title,
  };
}

function createApplication(): AgentCommandApplication {
  return {
    send: vi.fn(),
    clear: vi.fn(),
    deleteAllSessions: vi.fn(),
    createSession: vi.fn((title?: string) => testSession(title)),
    switchSession: vi.fn(async () => {}),
    deleteSession: vi.fn(async () => {}),
    renameSession: vi.fn(),
    getSnapshot: vi.fn(() => ({ mode: "plan" as const })),
    setMode: vi.fn(),
    revertLastTurn: vi.fn(async () => ({
      handled: true,
      message: "Reverted latest turn.",
      clearInput: true,
    })),
  };
}

describe("agent command executor", () => {
  it("keeps parsing and slash-command normalization behind the executor", async () => {
    const application = createApplication();
    const executor = new AgentCommandExecutor({ application });

    await expect(executor.execute("hello")).resolves.toEqual({ handled: false });
    await expect(executor.execute("/MODE   act")).resolves.toMatchObject({
      handled: true,
      message: "Mode switched to Act.",
    });
    expect(application.setMode).toHaveBeenCalledWith("act");
  });

  it("formats help text from command categories in the expected order", () => {
    const executor = new AgentCommandExecutor({ application: createApplication() });
    const help = executor.getHelpText();

    expect(help).toContain("Core\n/help - List all available commands");
    expect(help).toContain("/revert - Revert the latest turn's write/edit file changes");
    expect(help).toContain("Mode\n/mode - Show or switch Plan/Act mode");
    expect(help).toContain("Review\n/review - Review a pull request by number");
    expect(help.indexOf("Core")).toBeLessThan(help.indexOf("Mode"));
    expect(help.indexOf("Mode")).toBeLessThan(help.indexOf("Settings"));
    expect(help.indexOf("Settings")).toBeLessThan(help.indexOf("Session"));
    expect(help.indexOf("Session")).toBeLessThan(help.indexOf("Review"));
  });

  it("handles core, mode, session, and unknown commands through executor entries", async () => {
    const application = createApplication();
    const executor = new AgentCommandExecutor({ application });

    await expect(executor.execute("/help")).resolves.toMatchObject({
      handled: true,
      clearInput: true,
    });

    await expect(executor.execute("/mode act")).resolves.toMatchObject({
      handled: true,
      message: "Mode switched to Act.",
    });
    expect(application.setMode).toHaveBeenCalledWith("act");

    await expect(executor.execute("/session")).resolves.toMatchObject({
      handled: true,
      openPanelId: "session.picker",
    });

    await expect(executor.execute("/revert")).resolves.toMatchObject({
      handled: true,
      message: "Reverted latest turn.",
    });
    expect(application.revertLastTurn).toHaveBeenCalled();

    await expect(executor.execute("/nope")).resolves.toMatchObject({
      handled: true,
      message: "Unknown command: /nope. Type /help for a list of commands.",
    });
  });

  it("uses injected review services for review commands", async () => {
    const application = createApplication();
    const services = {
      fetchPRDiff: vi.fn(async () => "diff --git a/a.ts b/a.ts"),
      postPRComment: vi.fn(async () => "posted"),
    };
    const executor = new AgentCommandExecutor({ application, services });

    await expect(executor.execute("/review 42")).resolves.toMatchObject({
      handled: true,
      message: "Running code review on PR #42...",
    });
    expect(services.fetchPRDiff).toHaveBeenCalledWith(42);
    expect(application.send).toHaveBeenCalledWith(
      expect.stringContaining("PR #42"),
      { displayContent: "Reviewing PR #42" },
    );

    await expect(
      executor.execute("/review-post 42 Looks good"),
    ).resolves.toMatchObject({
      handled: true,
      message: "posted",
    });
    expect(services.postPRComment).toHaveBeenCalledWith(42, "Looks good");
  });

  it("encapsulates parsing, execution, definitions, and help text within AgentCommandExecutor", async () => {
    const application = createApplication();
    const services = {
      fetchPRDiff: vi.fn(async () => "diff"),
      postPRComment: vi.fn(async () => "posted"),
    };
    const executor = new AgentCommandExecutor({ application, services });

    expect(executor.getDefinitions().length).toBeGreaterThan(0);
    expect(executor.getHelpText()).toContain("Core\n/help - List all available commands");

    await expect(executor.execute("/nope")).resolves.toMatchObject({
      handled: true,
      message: "Unknown command: /nope. Type /help for a list of commands.",
    });

    await expect(executor.execute("/mode act")).resolves.toMatchObject({
      handled: true,
      message: "Mode switched to Act.",
    });
    expect(application.setMode).toHaveBeenCalledWith("act");

    await expect(executor.execute("/review-post 42 Looks good")).resolves.toMatchObject({
      handled: true,
      message: "posted",
    });
    expect(services.postPRComment).toHaveBeenCalledWith(42, "Looks good");
  });
});
