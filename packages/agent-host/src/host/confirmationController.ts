import type { ConfirmRequest } from "@excelsior/core";
import { confirmBus } from "../lib/runtime/confirmBus.js";

export class HostConfirmationController {
  private pendingConfirmation: ConfirmRequest | null = null;
  private autoApproveConfirmations = false;
  private readonly unsubscribe: () => void;

  constructor(private readonly notify: () => void) {
    this.unsubscribe = confirmBus.on("request", (request) => {
      if (this.autoApproveConfirmations) {
        confirmBus.emit("response", {
          callId: request.callId,
          approved: true,
        });
        return;
      }

      this.pendingConfirmation = request;
      this.notify();
    });
  }

  get pending(): ConfirmRequest | null {
    return this.pendingConfirmation;
  }

  respond(callId: string, approved: boolean): void {
    confirmBus.emit("response", { callId, approved });
    if (this.pendingConfirmation?.callId === callId) {
      this.pendingConfirmation = null;
      this.notify();
    }
  }

  approveAll(): void {
    this.autoApproveConfirmations = true;
    if (this.pendingConfirmation) {
      this.respond(this.pendingConfirmation.callId, true);
    }
  }

  dispose(): void {
    this.unsubscribe();
  }
}
