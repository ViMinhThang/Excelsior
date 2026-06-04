import type {
  AskQuestionRequest,
  AskQuestionResponse,
  ConfirmRequest,
  ConfirmResponse,
} from "@excelsior/core";

export class ConfirmationRouter {
  public pendingConfirmation: ConfirmRequest | null = null;
  public pendingQuestion: AskQuestionRequest | null = null;
  public readonly confirmationResolvers = new Map<string, (response: ConfirmResponse) => void>();
  public readonly questionResolvers = new Map<string, (response: AskQuestionResponse) => void>();

  resolveConfirmation(callId: string, approved: boolean): void {
    const resolver = this.confirmationResolvers.get(callId);
    if (resolver) {
      this.confirmationResolvers.delete(callId);
      resolver({ callId, approved });
    }
  }

  resolveQuestion(response: AskQuestionResponse): void {
    const resolver = this.questionResolvers.get(response.callId);
    if (resolver) {
      this.questionResolvers.delete(response.callId);
      resolver(response);
    }
  }

  cancelAll(): void {
    for (const [callId, resolve] of this.confirmationResolvers.entries()) {
      resolve({ callId, approved: false });
    }
    this.confirmationResolvers.clear();
    this.pendingConfirmation = null;

    for (const [callId, resolve] of this.questionResolvers.entries()) {
      resolve({
        callId,
        answer: "",
        isManual: true,
        cancelled: true,
      });
    }
    this.questionResolvers.clear();
    this.pendingQuestion = null;
  }
}
