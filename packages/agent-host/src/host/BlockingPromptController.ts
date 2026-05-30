import type {
  BlockingPromptBus,
  BlockingPromptRequest,
  BlockingPromptResponse,
} from "../runtime/blockingPrompt.js";

export class HostBlockingPromptController<
  TRequest extends BlockingPromptRequest,
  TResponse extends BlockingPromptResponse,
> {
  private pendingRequest: TRequest | null = null;
  private readonly unsubscribeRequest: () => void;
  private readonly unsubscribeResponse: () => void;

  constructor(
    private readonly bus: BlockingPromptBus<TRequest, TResponse>,
    private readonly notify: () => void,
    private readonly onRequest?: (request: TRequest) => TResponse | null,
  ) {
    this.unsubscribeRequest = bus.on("request", (request) => {
      const immediate = this.onRequest?.(request);
      if (immediate) {
        this.bus.emit("response", immediate);
        return;
      }

      this.setPending(request);
    });

    this.unsubscribeResponse = bus.on("response", (response) => {
      if (this.pendingRequest?.callId === response.callId) {
        this.setPending(null);
      }
    });
  }

  get pending(): TRequest | null {
    return this.pendingRequest;
  }

  respond(response: TResponse): void {
    this.bus.emit("response", response);
  }

  dispose(): void {
    this.unsubscribeRequest();
    this.unsubscribeResponse();
  }

  private setPending(next: TRequest | null): void {
    this.pendingRequest = next;
    this.notify();
  }
}
