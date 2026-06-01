import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LocalAgentHost,
  resetDefaultAgentHost,
} from "@excelsior/agent-host";
import { resetDb } from "@excelsior/agent-storage";
import { createBlockingPromptBus } from "@excelsior/agent-host/testing/runtime";
import type { AskQuestionRequest, AskQuestionResponse, ConfirmRequest, ConfirmResponse } from "@excelsior/core";

describe("LocalAgentHost", () => {
  beforeEach(() => {
    process.env.EXCELSIOR_DB_PATH = ":memory:";
    resetDefaultAgentHost();
    resetDb();
  });

  it("exposes a serializable client state without runtime instances", () => {
    const host = new LocalAgentHost();

    const state = host.getState();

    expect(() => JSON.stringify(state)).not.toThrow();
    expect(state).toMatchObject({
      displayBlocks: [],
      isLoading: false,
      currentSessionId: null,
      workspace: expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        rootPath: expect.any(String),
      }),
      mode: "plan",
      pendingConfirmation: null,
      pendingQuestion: null,
    });
    expect("activeRun" in state).toBe(false);

    host.dispose();
  });

  it("executes backend-owned commands through the host contract", async () => {
    const host = new LocalAgentHost();

    const result = await host.dispatch({
      type: "execute-command",
      input: "/mode act",
    });

    expect(result).toMatchObject({
      type: "command-result",
      result: {
      handled: true,
      message: "Mode switched to Act.",
      clearInput: true,
      },
    });
    expect(host.getState().mode).toBe("act");

    host.dispose();
  });

  it("keeps tool confirmation state behind the host", () => {
    const confirmBus = createBlockingPromptBus<ConfirmRequest, ConfirmResponse>();
    const host = new LocalAgentHost({ confirmBus });

    confirmBus.emit("request", {
      callId: "call_1",
      toolName: "writeFile",
      args: "{\"filePath\":\"demo.ts\"}",
      filePath: "demo.ts",
      action: "edit",
      diff: "--- demo.ts\n+++ demo.ts",
    });

    expect(host.getState().pendingConfirmation?.callId).toBe("call_1");

    void host.dispatch({
      type: "respond-to-confirmation",
      callId: "call_1",
      approved: true,
    });

    expect(host.getState().pendingConfirmation).toBeNull();

    host.dispose();
  });

  it("notifies subscribers when confirmation state changes", () => {
    const confirmBus = createBlockingPromptBus<ConfirmRequest, ConfirmResponse>();
    const host = new LocalAgentHost({ confirmBus });
    const listener = vi.fn();
    host.subscribe(listener);

    confirmBus.emit("request", {
      callId: "call_1",
      toolName: "writeFile",
      args: "{\"filePath\":\"demo.ts\"}",
      filePath: "demo.ts",
      action: "edit",
      diff: "--- demo.ts\n+++ demo.ts",
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(host.getState().pendingConfirmation?.callId).toBe("call_1");

    void host.dispatch({
      type: "respond-to-confirmation",
      callId: "call_1",
      approved: false,
    });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(host.getState().pendingConfirmation).toBeNull();

    host.dispose();
  });

  it("auto-approves future confirmations after approve all", async () => {
    const confirmBus = createBlockingPromptBus<ConfirmRequest, ConfirmResponse>();
    const host = new LocalAgentHost({ confirmBus });
    const responses: Array<{ callId: string; approved: boolean }> = [];
    const unsubscribeResponse = confirmBus.on("response", (response) => {
      responses.push(response);
    });

    await host.dispatch({ type: "approve-all-confirmations" });
    confirmBus.emit("request", {
      callId: "call_auto",
      toolName: "writeFile",
      args: "{\"filePath\":\"demo.ts\"}",
    });

    expect(responses).toEqual([{ callId: "call_auto", approved: true }]);
    expect(host.getState().pendingConfirmation).toBeNull();

    unsubscribeResponse();
    host.dispose();
  });

  it("keeps pending question state behind the host", async () => {
    const questionBus = createBlockingPromptBus<AskQuestionRequest, AskQuestionResponse>();
    const host = new LocalAgentHost({ questionBus });

    questionBus.emit("request", {
      callId: "question_1",
      question: "Which surface?",
      options: [{ id: "both", label: "Desktop + TUI" }],
      allowManual: true,
    });

    expect(host.getState().pendingQuestion).toMatchObject({
      callId: "question_1",
      question: "Which surface?",
    });

    await host.dispatch({
      type: "respond-to-question",
      response: {
        callId: "question_1",
        answer: "Desktop + TUI",
        selectedOptionId: "both",
        selectedOptionLabel: "Desktop + TUI",
        isManual: false,
      },
    });

    expect(host.getState().pendingQuestion).toBeNull();

    host.dispose();
  });

  it("notifies subscribers when pending question state changes", async () => {
    const questionBus = createBlockingPromptBus<AskQuestionRequest, AskQuestionResponse>();
    const host = new LocalAgentHost({ questionBus });
    const listener = vi.fn();
    host.subscribe(listener);

    questionBus.emit("request", {
      callId: "question_1",
      question: "Which surface?",
      options: [],
      allowManual: true,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(host.getState().pendingQuestion?.callId).toBe("question_1");

    await host.dispatch({
      type: "respond-to-question",
      response: {
        callId: "question_1",
        answer: "Manual answer",
        isManual: true,
      },
    });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(host.getState().pendingQuestion).toBeNull();

    host.dispose();
  });
});
