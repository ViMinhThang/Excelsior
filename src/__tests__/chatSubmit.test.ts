import { describe, expect, it, vi } from "vitest";
import { createFeatureRuntimeContext, submitChatInput } from "../tui/lib/chatSubmit.js";

function baseContext(setCommandResult = vi.fn()) {
  return createFeatureRuntimeContext({
    navigate: vi.fn(),
    goBack: vi.fn(),
    setCommandResult,
    clear: vi.fn(),
    deleteAllSessions: vi.fn(),
    resetInput: vi.fn(),
    send: vi.fn(),
    postComment: vi.fn(async () => "ok"),
    switchSession: vi.fn(),
    createSession: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
    listSessions: vi.fn(() => []),
    sessions: [],
    currentSessionId: null,
    openPanel: vi.fn(),
    closePanel: vi.fn(),
    getHelpText: vi.fn(() => "Available commands"),
  });
}

describe("chat submit helper", () => {
  it("sends normal chat messages", () => {
    const send = vi.fn();
    const resetInput = vi.fn();

    submitChatInput({
      input: " hello ",
      isLoading: false,
      commandContext: baseContext(),
      resetInput,
      setInput: vi.fn(),
      send,
    });

    expect(resetInput).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("hello");
  });

  it("passes known slash commands exactly and clears input", async () => {
    const setInput = vi.fn();
    const handleCommand = vi.fn(async () => true);

    submitChatInput({
      input: "/review 42",
      isLoading: false,
      commandContext: baseContext(),
      resetInput: vi.fn(),
      setInput,
      send: vi.fn(),
      handleCommand,
    });
    await Promise.resolve();

    expect(handleCommand).toHaveBeenCalledWith("/review 42", expect.any(Object));
    expect(setInput).toHaveBeenCalledWith("");
  });

  it("allows command handlers to surface unknown command results", async () => {
    const setCommandResult = vi.fn();
    const context = baseContext(setCommandResult);
    const handleCommand = vi.fn(async (_input: string, commandContext: typeof context) => {
      commandContext.appendMessage("system", "Unknown command");
      return true;
    });

    submitChatInput({
      input: "/nope",
      isLoading: false,
      commandContext: context,
      resetInput: vi.fn(),
      setInput: vi.fn(),
      send: vi.fn(),
      handleCommand,
    });
    await Promise.resolve();

    expect(setCommandResult).toHaveBeenCalledWith("Unknown command");
  });
});
