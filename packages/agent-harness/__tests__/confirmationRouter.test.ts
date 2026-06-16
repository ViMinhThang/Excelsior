import { describe, expect, it, vi } from "vitest";
import { ConfirmationRouter } from "../src/ConfirmationRouter.js";
import type { ConfirmRequest, ConfirmResponse } from "@excelsior/core";

function request(callId: string): ConfirmRequest {
  return {
    callId,
    toolName: "writeFile",
    args: JSON.stringify({ filePath: `${callId}.txt` }),
  };
}

describe("ConfirmationRouter", () => {
  it("queues multiple pending confirmations instead of replacing the visible one", () => {
    const router = new ConfirmationRouter();
    const first = vi.fn();
    const second = vi.fn();

    router.addConfirmation(request("first"), first);
    router.addConfirmation(request("second"), second);

    expect(router.pendingConfirmation?.callId).toBe("first");
    router.resolveConfirmation("first", true);

    expect(first).toHaveBeenCalledWith({ callId: "first", approved: true });
    expect(router.pendingConfirmation?.callId).toBe("second");
    expect(second).not.toHaveBeenCalled();
  });

  it("approves all queued confirmations", () => {
    const router = new ConfirmationRouter();
    const responses: ConfirmResponse[] = [];

    router.addConfirmation(request("first"), (response) => responses.push(response));
    router.addConfirmation(request("second"), (response) => responses.push(response));
    router.approveAllConfirmations();

    expect(responses).toEqual([
      { callId: "first", approved: true },
      { callId: "second", approved: true },
    ]);
    expect(router.pendingConfirmation).toBeNull();
  });
});
