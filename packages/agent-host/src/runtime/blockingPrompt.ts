import { randomUUID } from "crypto";
import {
  createChannelBus,
  type Bus,
} from "@excelsior/run-runtime";
import type {
  ConfirmRequest,
  ConfirmResponse,
  AskQuestionRequest,
  AskQuestionResponse,
} from "@excelsior/core";

export type { ConfirmRequest, ConfirmResponse };


export type BlockingPromptRequest = { callId: string };
export type BlockingPromptResponse = { callId: string };

export type BlockingPromptEvents<
  TRequest extends BlockingPromptRequest,
  TResponse extends BlockingPromptResponse,
> = {
  request: TRequest;
  response: TResponse;
};

export type BlockingPromptBus<
  TRequest extends BlockingPromptRequest,
  TResponse extends BlockingPromptResponse,
> = Bus<BlockingPromptEvents<TRequest, TResponse>>;

export type ConfirmEvents = BlockingPromptEvents<ConfirmRequest, ConfirmResponse>;
export type ConfirmPromptBus = BlockingPromptBus<ConfirmRequest, ConfirmResponse>;

export type QuestionEvents = BlockingPromptEvents<AskQuestionRequest, AskQuestionResponse>;
export type QuestionPromptBus = BlockingPromptBus<AskQuestionRequest, AskQuestionResponse>;


export function createBlockingPromptBus<
  TRequest extends BlockingPromptRequest,
  TResponse extends BlockingPromptResponse,
>(): BlockingPromptBus<TRequest, TResponse> {
  return createChannelBus<BlockingPromptEvents<TRequest, TResponse>>();
}

export function requestBlockingPrompt<
  TRequest extends BlockingPromptRequest,
  TResponse extends BlockingPromptResponse,
  TResult = TResponse,
>(input: {
  bus: BlockingPromptBus<TRequest, TResponse>;
  buildRequest: (callId: string) => TRequest;
  mapResponse: (response: TResponse) => TResult;
  abortSignal?: AbortSignal;
  buildCancelledResponse?: (callId: string) => TResponse;
}): Promise<TResult> {
  return new Promise((resolve) => {
    const callId = randomUUID();
    let settled = false;
    let unsubscribe: (() => void) | null = null;

    function finish(response: TResponse) {
      if (settled) return;
      settled = true;
      unsubscribe?.();
      input.abortSignal?.removeEventListener("abort", abort);
      resolve(input.mapResponse(response));
    }

    function abort() {
      const cancelled = input.buildCancelledResponse?.(callId);
      if (!cancelled) return;
      input.bus.emit("response", cancelled);
      finish(cancelled);
    }

    unsubscribe = input.bus.on("response", (response) => {
      if (response.callId === callId) finish(response);
    });

    if (input.abortSignal?.aborted) {
      abort();
      return;
    }

    input.abortSignal?.addEventListener("abort", abort, { once: true });
    input.bus.emit("request", input.buildRequest(callId));
  });
}
