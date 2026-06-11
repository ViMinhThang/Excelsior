import type {
  AskQuestionRequest,
  AskQuestionResponse,
  ConfirmRequest,
  ConfirmResponse,
} from "@excelsior/core";

class PendingRequestRoute<TRequest, TResponse> {
  public pending: TRequest | null = null;
  private readonly resolvers = new Map<string, (response: TResponse) => void>();

  constructor(
    private readonly cancelResponse: (callId: string) => TResponse,
  ) {}

  add(callId: string, request: TRequest, resolver: (response: TResponse) => void): void {
    this.pending = request;
    this.resolvers.set(callId, resolver);
  }

  resolve(callId: string, response: TResponse): void {
    const resolver = this.resolvers.get(callId);
    if (!resolver) return;
    this.resolvers.delete(callId);
    this.pending = null;
    resolver(response);
  }

  cancelAll(): void {
    for (const [callId, resolve] of this.resolvers.entries()) {
      resolve(this.cancelResponse(callId));
    }
    this.resolvers.clear();
    this.pending = null;
  }
}

export class ConfirmationRouter {
  private readonly confirmations = new PendingRequestRoute<ConfirmRequest, ConfirmResponse>(
    (callId) => ({ callId, approved: false }),
  );
  private readonly questions = new PendingRequestRoute<AskQuestionRequest, AskQuestionResponse>(
    (callId) => ({
      callId,
      answer: "",
      isManual: true,
      cancelled: true,
    }),
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

  resolveQuestion(response: AskQuestionResponse): void {
    this.questions.resolve(response.callId, response);
  }

  cancelAll(): void {
    this.confirmations.cancelAll();
    this.questions.cancelAll();
  }
}
