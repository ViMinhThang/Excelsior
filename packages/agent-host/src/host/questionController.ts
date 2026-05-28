import type {
  AskQuestionRequest,
  AskQuestionResponse,
} from "@excelsior/core";
import type { QuestionPromptBus } from "../runtime/questionTypes.js";
import { HostBlockingPromptController } from "./BlockingPromptController.js";

export class HostQuestionController {
  private readonly controller: HostBlockingPromptController<
    AskQuestionRequest,
    AskQuestionResponse
  >;

  constructor(
    questionBus: QuestionPromptBus,
    private readonly notify: () => void,
  ) {
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
