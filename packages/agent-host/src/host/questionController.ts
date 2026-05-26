import type {
  AskQuestionRequest,
  AskQuestionResponse,
} from "@excelsior/core";
import { questionBus } from "../runtime/questionBus.js";
import { HostBlockingPromptController } from "./BlockingPromptController.js";

export class HostQuestionController {
  private readonly controller: HostBlockingPromptController<
    AskQuestionRequest,
    AskQuestionResponse
  >;

  constructor(private readonly notify: () => void) {
    this.controller = new HostBlockingPromptController(questionBus, this.notify);
  }

  get pending(): AskQuestionRequest | null {
    return this.controller.pending;
  }

  respond(response: AskQuestionResponse): void {
    this.controller.respond(response);
  }

  dispose(): void {
    this.controller.dispose();
  }
}
