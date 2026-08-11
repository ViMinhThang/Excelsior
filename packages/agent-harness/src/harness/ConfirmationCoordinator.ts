import { randomUUID } from "node:crypto";
import type {
  AskQuestionRequest,
  AskQuestionResponse,
  ConfirmRequest,
  ConfirmResponse,
} from "@excelsior/core";
import {
  CONFIRMATION_ANSWERED,
  CONFIRMATION_REQUESTED,
  QUESTION_ANSWERED,
  QUESTION_REQUESTED,
} from "../events.js";
import type { EventBus } from "../EventBus.js";
import { ConfirmationRouter } from "../ConfirmationRouter.js";
import type { ActiveRunManager } from "../run/ActiveRunManager.js";
import type { SessionManager } from "../SessionManager.js";

interface ConfirmationCoordinatorDeps {
  eventBus: EventBus;
  activeRun: ActiveRunManager;
  sessionManager: SessionManager;
  notify: () => void;
}

export class ConfirmationCoordinator {
  private readonly router = new ConfirmationRouter();

  constructor(private readonly deps: ConfirmationCoordinatorDeps) {}

  get pendingConfirmation(): ConfirmRequest | null {
    return this.router.pendingConfirmation;
  }

  get pendingQuestion(): AskQuestionRequest | null {
    return this.router.pendingQuestion;
  }

  requestConfirmation(request: Omit<ConfirmRequest, "callId">): Promise<ConfirmResponse> {
    return this.request(
      (callId) => ({ callId, ...request }),
      (built, resolve) => this.router.addConfirmation(built, resolve),
      CONFIRMATION_REQUESTED,
      CONFIRMATION_ANSWERED,
    );
  }

  requestQuestion(input: Omit<AskQuestionRequest, "callId">): Promise<AskQuestionResponse> {
    return this.request(
      (callId) => ({ callId, ...input }),
      (built, resolve) => this.router.addQuestion(built, resolve),
      QUESTION_REQUESTED,
      QUESTION_ANSWERED,
    );
  }

  respondToConfirmation(callId: string, approved: boolean): void {
    this.router.resolveConfirmation(callId, approved);
  }

  approveAllConfirmations(): void {
    this.router.approveAllConfirmations();
  }

  respondToQuestion(response: AskQuestionResponse): void {
    this.router.resolveQuestion(response);
  }

  cancelAll(): void {
    this.router.cancelAll();
  }

  private request<TRequest extends { callId: string }, TResponse>(
    build: (callId: string) => TRequest,
    register: (request: TRequest, resolve: (response: TResponse) => void) => void,
    requestedType: typeof CONFIRMATION_REQUESTED | typeof QUESTION_REQUESTED,
    answeredType: typeof CONFIRMATION_ANSWERED | typeof QUESTION_ANSWERED,
  ): Promise<TResponse> {
    return new Promise<TResponse>((resolveResponse) => {
      const callId = randomUUID();
      const active = this.deps.activeRun.currentIdentity();
      const runId = active?.runId ?? `run_${randomUUID()}`;
      const turnId = active?.turnId;
      const sessionId = active?.sessionId ?? this.deps.sessionManager.currentSession()?.id;
      const request = build(callId);
      register(request, (response) => {
        if (sessionId) {
          this.deps.eventBus.emit(runId, answeredType, { response } as never, { sessionId, turnId });
        }
        resolveResponse(response);
        this.deps.notify();
      });
      if (sessionId) {
        this.deps.eventBus.emit(runId, requestedType, { request } as never, { sessionId, turnId });
      }
      this.deps.notify();
    });
  }
}
