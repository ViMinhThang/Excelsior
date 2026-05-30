import { describe, expect, it, vi } from "vitest";
import {
  createBlockingPromptBus,
  requestBlockingPrompt,
  type BlockingPromptRequest,
  type BlockingPromptResponse,
} from "@excelsior/agent-host/testing/runtime";
import { HostBlockingPromptController } from "../src/host/BlockingPromptController.js";

type TestRequest = BlockingPromptRequest & { message: string };
type TestResponse = BlockingPromptResponse & {
  answer: string;
  cancelled?: boolean;
};

describe("blocking prompt runtime helper", () => {
  it("resolves only the matching call id and unsubscribes after response", async () => {
    const bus = createBlockingPromptBus<TestRequest, TestResponse>();
    const unsubscribeRequest = bus.on("request", (request) => {
      bus.emit("response", { callId: "other", answer: "ignore" });
      bus.emit("response", { callId: request.callId, answer: "ok" });
    });

    const result = await requestBlockingPrompt({
      bus,
      buildRequest: (callId) => ({ callId, message: "Continue?" }),
      mapResponse: (response) => response.answer,
    });

    expect(result).toBe("ok");
    expect(bus.getListenerCount("response")).toBe(0);
    unsubscribeRequest();
  });

  it("emits and resolves a cancelled response on abort", async () => {
    const bus = createBlockingPromptBus<TestRequest, TestResponse>();
    const abort = new AbortController();
    const responses: TestResponse[] = [];
    const unsubscribeResponse = bus.on("response", (response) => {
      responses.push(response);
    });
    const requestSeen = new Promise<void>((resolve) => {
      const unsubscribeRequest = bus.on("request", () => {
        unsubscribeRequest();
        resolve();
      });
    });

    const pending = requestBlockingPrompt({
      bus,
      buildRequest: (callId) => ({ callId, message: "Continue?" }),
      mapResponse: (response) => response,
      abortSignal: abort.signal,
      buildCancelledResponse: (callId) => ({
        callId,
        answer: "",
        cancelled: true,
      }),
    });

    await requestSeen;
    abort.abort();

    await expect(pending).resolves.toMatchObject({ cancelled: true });
    expect(responses).toEqual([expect.objectContaining({ cancelled: true })]);
    unsubscribeResponse();
  });
});

describe("HostBlockingPromptController", () => {
  it("stores a pending request and clears it on matching response", () => {
    const bus = createBlockingPromptBus<TestRequest, TestResponse>();
    const notify = vi.fn();
    const controller = new HostBlockingPromptController(bus, notify);

    bus.emit("request", { callId: "call_1", message: "Continue?" });
    expect(controller.pending).toMatchObject({ callId: "call_1" });

    bus.emit("response", { callId: "other", answer: "ignore" });
    expect(controller.pending).toMatchObject({ callId: "call_1" });

    bus.emit("response", { callId: "call_1", answer: "ok" });
    expect(controller.pending).toBeNull();
    expect(notify).toHaveBeenCalledTimes(2);

    controller.dispose();
  });

  it("supports immediate request handling without exposing pending state", () => {
    const bus = createBlockingPromptBus<TestRequest, TestResponse>();
    const notify = vi.fn();
    const responses: TestResponse[] = [];
    const unsubscribeResponse = bus.on("response", (response) => {
      responses.push(response);
    });
    const controller = new HostBlockingPromptController(
      bus,
      notify,
      (request) => ({ callId: request.callId, answer: "auto" }),
    );

    bus.emit("request", { callId: "call_1", message: "Continue?" });

    expect(controller.pending).toBeNull();
    expect(responses).toEqual([{ callId: "call_1", answer: "auto" }]);
    expect(notify).not.toHaveBeenCalled();

    unsubscribeResponse();
    controller.dispose();
  });
});
