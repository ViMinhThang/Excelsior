import type {
  AskQuestionRequest,
  AskQuestionResponse,
  ConfirmRequest,
  ConfirmResponse,
} from "@excelsior/protocol";
import { DiffEmitter } from "./diffEmitter.js";
import type { MetaState, Mutate } from "./mutate.js";

export class InteractionManager {
  private readonly mutate: Mutate;
  private readonly emitter: DiffEmitter;
  private readonly meta: MetaState;

  constructor(deps: { mutate: Mutate; emitter: DiffEmitter; meta: MetaState }) {
    this.mutate = deps.mutate;
    this.emitter = deps.emitter;
    this.meta = deps.meta;
  }

  private sessionId(): string | null {
    return this.meta.currentSessionId;
  }

  requestConfirmation(request: ConfirmRequest): Promise<boolean> {
    return new Promise((resolve) => {
      const sessionId = this.sessionId();
      if (!sessionId) {
        resolve(false);
        return;
      }
      this.mutate({ kind: "interaction-confirm-request", callId: request.callId, request });
      this.waitForConfirmation(sessionId, request.callId, resolve);
    });
  }

  requestQuestion(request: AskQuestionRequest): Promise<AskQuestionResponse> {
    return new Promise((resolve) => {
      const sessionId = this.sessionId();
      if (!sessionId) {
        resolve({ callId: request.callId, answer: "", isManual: false, cancelled: true });
        return;
      }
      this.mutate({ kind: "interaction-question-request", callId: request.callId, request });
      this.waitForQuestion(sessionId, request.callId, resolve);
    });
  }

  respondToConfirmation(callId: string, approved: boolean): void {
    this.mutate({ kind: "interaction-confirm-respond", callId, approved });
  }

  respondToQuestion(response: AskQuestionResponse): void {
    this.mutate({ kind: "interaction-question-respond", callId: response.callId, response });
  }

  approveAllConfirmations(): void {
    this.mutate({ kind: "interaction-confirm-approve-all" });
  }

  cancelAll(): void {
    this.mutate({ kind: "interaction-confirm-cancel-all" });
  }

  private waitForConfirmation(
    sessionId: string,
    callId: string,
    resolve: (approved: boolean) => void,
  ): void {
    const unsubscribe = this.emitter.subscribe((delta) => {
      if (delta.scope.kind !== "session" || delta.scope.sessionId !== sessionId) return;
      if (delta.delta.kind !== "interaction") return;
      const slot = delta.delta.interaction.confirmation;
      if (!slot) {
        unsubscribe();
        resolve(false);
        return;
      }
      if (slot.callId !== callId) return;
      unsubscribe();
      resolve(slot.approved ?? false);
    });
  }

  private waitForQuestion(
    sessionId: string,
    callId: string,
    resolve: (response: AskQuestionResponse) => void,
  ): void {
    const unsubscribe = this.emitter.subscribe((delta) => {
      if (delta.scope.kind !== "session" || delta.scope.sessionId !== sessionId) return;
      if (delta.delta.kind !== "interaction") return;
      const slot = delta.delta.interaction.question;
      if (!slot) {
        unsubscribe();
        resolve({ callId, answer: "", isManual: false, cancelled: true });
        return;
      }
      if (slot.callId !== callId) return;
      unsubscribe();
      resolve(slot.response ?? { callId, answer: "", isManual: false, cancelled: true });
    });
  }
}

export type { ConfirmRequest, AskQuestionResponse };
export type { ConfirmResponse };
