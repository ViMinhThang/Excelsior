import type {
  ConfirmRequest,
  ConfirmResponse,
} from "@excelsior/core";
import type { ConfirmPromptBus } from "../runtime/confirmTypes.js";
import { HostBlockingPromptController } from "./BlockingPromptController.js";

export class HostConfirmationController {
  private autoApproveConfirmations = false;
  private readonly controller: HostBlockingPromptController<
    ConfirmRequest,
    ConfirmResponse
  >;

  constructor(
    confirmBus: ConfirmPromptBus,
    private readonly notify: () => void,
  ) {
    this.controller = new HostBlockingPromptController(
      confirmBus,
      this.notify,
      (request) =>
        this.autoApproveConfirmations
          ? { callId: request.callId, approved: true }
          : null,
    );
  }

  get pending(): ConfirmRequest | null {
    return this.controller.pending;
  }

  respond(callId: string, approved: boolean): void {
    this.controller.respond({ callId, approved });
  }

  approveAll(): void {
    this.autoApproveConfirmations = true;
    if (this.pending) {
      this.respond(this.pending.callId, true);
    }
  }

  dispose(): void {
    this.controller.dispose();
  }
}
