import { describe, expect, it, vi } from "vitest";
import {
  createAgentCommands,
  executeAgentCommand,
  type AgentCommandHost,
} from "@excelsior/agent-host/commands";

function createHost(): AgentCommandHost {
  return {
    send: vi.fn(),
    clearMessages: vi.fn(),
    deleteAllSessions: vi.fn(),
    createSession: vi.fn(),
    switchSession: vi.fn(async () => {}),
    deleteSession: vi.fn(async () => {}),
    renameSession: vi.fn(),
    getMode: vi.fn(() => "plan"),
    setMode: vi.fn(),
  };
}

describe("agent command registry", () => {
  it("handles core, mode, session, and unknown commands through registry entries", async () => {
    const host = createHost();
    const commands = createAgentCommands();

    await expect(executeAgentCommand("/help", host, commands)).resolves.toMatchObject({
      handled: true,
      clearInput: true,
    });

    await expect(executeAgentCommand("/mode act", host, commands)).resolves.toMatchObject({
      handled: true,
      message: "Mode switched to Act.",
    });
    expect(host.setMode).toHaveBeenCalledWith("act");

    await expect(executeAgentCommand("/session", host, commands)).resolves.toMatchObject({
      handled: true,
      openPanelId: "session.picker",
    });

    await expect(executeAgentCommand("/nope", host, commands)).resolves.toMatchObject({
      handled: true,
      message: "Unknown command: /nope. Type /help for a list of commands.",
    });
  });

  it("uses injected review services for review commands", async () => {
    const host = createHost();
    const services = {
      fetchPRDiff: vi.fn(async () => "diff --git a/a.ts b/a.ts"),
      postPRComment: vi.fn(async () => "posted"),
    };
    const commands = createAgentCommands(services);

    await expect(executeAgentCommand("/review 42", host, commands)).resolves.toMatchObject({
      handled: true,
      message: "Running code review on PR #42...",
    });
    expect(services.fetchPRDiff).toHaveBeenCalledWith(42);
    expect(host.send).toHaveBeenCalledWith(
      expect.stringContaining("PR #42"),
      { displayContent: "Reviewing PR #42" },
    );

    await expect(
      executeAgentCommand("/review-post 42 Looks good", host, commands),
    ).resolves.toMatchObject({
      handled: true,
      message: "posted",
    });
    expect(services.postPRComment).toHaveBeenCalledWith(42, "Looks good");
  });
});
