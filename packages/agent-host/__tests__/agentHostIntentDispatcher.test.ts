import { describe, expect, it, vi } from "vitest";
import {
  AgentHostIntentDispatcher,
  type AgentHostIntentDispatcherOptions,
} from "../src/host/dispatcher.js";

function createMockOptions(): AgentHostIntentDispatcherOptions {
  return {
    application: {
      send: vi.fn(),
      cancel: vi.fn(),
      clear: vi.fn(),
      revertLastTurn: vi.fn(async () => ({ handled: true, message: "Turn reverted." })),
      createSession: vi.fn((title) => ({
        id: "ses_123",
        startedAt: "2026-01-01",
        updatedAt: "2026-01-01",
        workspaceId: "ws_123",
        metadata: { userInput: title || "" },
      })),
      switchSession: vi.fn(),
      deleteSession: vi.fn(),
      renameSession: vi.fn(),
      deleteAllSessions: vi.fn(),
      setMode: vi.fn(),
      toggleMode: vi.fn((): "act" => "act"),
    },
    settings: {
      saveSettings: vi.fn(),
    },
    confirmations: {
      respond: vi.fn(),
      approveAll: vi.fn(),
    },
    questions: {
      respond: vi.fn(),
    },
    commandExecutor: {
      execute: vi.fn(async (input) => ({
        handled: true,
        message: `Executed: ${input}`,
      })),
    },
  };
}

describe("AgentHostIntentDispatcher", () => {
  it("routes turn intents to the application", async () => {
    const options = createMockOptions();
    const dispatcher = new AgentHostIntentDispatcher(options);

    // Test send
    let result = await dispatcher.dispatch({ type: "send", content: "hello", options: { silent: true } });
    expect(result).toEqual({ type: "none" });
    expect(options.application.send).toHaveBeenCalledWith("hello", { silent: true });

    // Test cancel
    result = await dispatcher.dispatch({ type: "cancel" });
    expect(result).toEqual({ type: "none" });
    expect(options.application.cancel).toHaveBeenCalled();

    // Test clear
    result = await dispatcher.dispatch({ type: "clear-messages" });
    expect(result).toEqual({ type: "none" });
    expect(options.application.clear).toHaveBeenCalled();

    // Test revert
    result = await dispatcher.dispatch({ type: "revert-last-turn" });
    expect(result).toEqual({
      type: "command-result",
      result: { handled: true, message: "Turn reverted." },
    });
    expect(options.application.revertLastTurn).toHaveBeenCalled();
  });

  it("routes command intents to the command executor", async () => {
    const options = createMockOptions();
    const dispatcher = new AgentHostIntentDispatcher(options);

    const result = await dispatcher.dispatch({ type: "execute-command", input: "/mode act" });
    expect(result).toEqual({
      type: "command-result",
      result: { handled: true, message: "Executed: /mode act" },
    });
    expect(options.commandExecutor.execute).toHaveBeenCalledWith("/mode act");
  });

  it("routes session intents to the application", async () => {
    const options = createMockOptions();
    const dispatcher = new AgentHostIntentDispatcher(options);

    // Create session
    let result = await dispatcher.dispatch({ type: "create-session", title: "My Session" });
    expect(result).toEqual({
      type: "session",
      session: expect.objectContaining({ id: "ses_123", metadata: { userInput: "My Session" } }),
    });
    expect(options.application.createSession).toHaveBeenCalledWith("My Session");

    // Switch session
    result = await dispatcher.dispatch({ type: "switch-session", sessionId: "ses_1" });
    expect(result).toEqual({ type: "none" });
    expect(options.application.switchSession).toHaveBeenCalledWith("ses_1");

    // Delete session
    result = await dispatcher.dispatch({ type: "delete-session", sessionId: "ses_2" });
    expect(result).toEqual({ type: "none" });
    expect(options.application.deleteSession).toHaveBeenCalledWith("ses_2");

    // Rename session
    result = await dispatcher.dispatch({ type: "rename-session", sessionId: "ses_3", title: "New Name" });
    expect(result).toEqual({ type: "none" });
    expect(options.application.renameSession).toHaveBeenCalledWith("ses_3", "New Name");

    // Delete all sessions
    result = await dispatcher.dispatch({ type: "delete-all-sessions" });
    expect(result).toEqual({ type: "none" });
    expect(options.application.deleteAllSessions).toHaveBeenCalled();
  });

  it("routes settings intents to the application and settings store", async () => {
    const options = createMockOptions();
    const dispatcher = new AgentHostIntentDispatcher(options);

    // Set mode
    let result = await dispatcher.dispatch({ type: "set-mode", mode: "plan" });
    expect(result).toEqual({ type: "none" });
    expect(options.application.setMode).toHaveBeenCalledWith("plan");

    // Toggle mode
    result = await dispatcher.dispatch({ type: "toggle-mode" });
    expect(result).toEqual({ type: "mode", mode: "act" });
    expect(options.application.toggleMode).toHaveBeenCalled();

    // Save settings
    result = await dispatcher.dispatch({ type: "save-settings", settings: { deepseekApiKey: "123" } });
    expect(result).toEqual({ type: "none" });
    expect(options.settings.saveSettings).toHaveBeenCalledWith({ deepseekApiKey: "123" });
  });

  it("routes confirmation and question intents to their controllers", async () => {
    const options = createMockOptions();
    const dispatcher = new AgentHostIntentDispatcher(options);

    // Respond to confirmation
    let result = await dispatcher.dispatch({ type: "respond-to-confirmation", callId: "c_1", approved: true });
    expect(result).toEqual({ type: "none" });
    expect(options.confirmations.respond).toHaveBeenCalledWith("c_1", true);

    // Approve all confirmations
    result = await dispatcher.dispatch({ type: "approve-all-confirmations" });
    expect(result).toEqual({ type: "none" });
    expect(options.confirmations.approveAll).toHaveBeenCalled();

    // Respond to question
    result = await dispatcher.dispatch({
      type: "respond-to-question",
      response: { callId: "q_1", answer: "manual answer", isManual: true },
    });
    expect(result).toEqual({ type: "none" });
    expect(options.questions.respond).toHaveBeenCalledWith({ callId: "q_1", answer: "manual answer", isManual: true });
  });
});
