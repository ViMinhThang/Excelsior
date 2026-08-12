import type {
  AskQuestionRequest,
  AskQuestionResponse,
  ConfirmRequest,
  ConfirmResponse,
} from "@excelsior/core";

class PendingRequestRoute<TRequest, TResponse> {
  private readonly queue: TRequest[] = [];
  private readonly resolvers = new Map<string, (response: TResponse) => void>();

  constructor(
    private readonly cancelResponse: (callId: string) => TResponse,
    private readonly getCallId: (request: TRequest) => string,
  ) {}

  get pending(): TRequest | null {
    return this.queue[0] ?? null;
  }

  add(callId: string, request: TRequest, resolver: (response: TResponse) => void): void {
    this.queue.push(request);
    this.resolvers.set(callId, resolver);
  }

  resolve(callId: string, response: TResponse): void {
    const resolver = this.resolvers.get(callId);
    if (!resolver) return;
    this.resolvers.delete(callId);
    const queueIndex = this.queue.findIndex((request) => this.getCallId(request) === callId);
    if (queueIndex !== -1) this.queue.splice(queueIndex, 1);
    resolver(response);
  }

  resolveAll(responseFor: (callId: string) => TResponse): void {
    const callIds = this.queue.map((request) => this.getCallId(request));
    for (const callId of callIds) {
      this.resolve(callId, responseFor(callId));
    }
  }

  cancelAll(): void {
    for (const [callId, resolve] of this.resolvers.entries()) {
      resolve(this.cancelResponse(callId));
    }
    this.resolvers.clear();
    this.queue.length = 0;
  }
}

export class ConfirmationRouter {
  private readonly confirmations = new PendingRequestRoute<ConfirmRequest, ConfirmResponse>(
    (callId) => ({ callId, approved: false }),
    (request) => request.callId,
  );
  private readonly questions = new PendingRequestRoute<AskQuestionRequest, AskQuestionResponse>(
    (callId) => ({
      callId,
      answer: "",
      isManual: true,
      cancelled: true,
    }),
    (request) => request.callId,
  );

  get pendingConfirmation(): ConfirmRequest | null {
    return this.confirmations.pending;
  }

  get pendingQuestion(): AskQuestionRequest | null {
    return this.questions.pending;
  }

  addConfirmation(
    request: ConfirmRequest,
    resolver: (response: ConfirmResponse) => void,
  ): void {
    this.confirmations.add(request.callId, request, resolver);
  }

  addQuestion(
    request: AskQuestionRequest,
    resolver: (response: AskQuestionResponse) => void,
  ): void {
    this.questions.add(request.callId, request, resolver);
  }

  resolveConfirmation(callId: string, approved: boolean): void {
    this.confirmations.resolve(callId, { callId, approved });
  }

  approveAllConfirmations(): void {
    this.confirmations.resolveAll((callId) => ({ callId, approved: true }));
  }

  resolveQuestion(response: AskQuestionResponse): void {
    this.questions.resolve(response.callId, response);
  }

  cancelAll(): void {
    this.confirmations.cancelAll();
    this.questions.cancelAll();
  }
}
