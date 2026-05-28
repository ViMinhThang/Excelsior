import type {
  AgentClientState,
  AgentHost,
  AgentHostCatalog,
  AgentHostDispatchResult,
  AgentHostIntent,
} from "@excelsior/client";
import { AgentApplication } from "../application/AgentApplication.js";
import { AgentCommandExecutor } from "../commands.js";
import { createAgentClientState } from "./clientState.js";
import { HostConfirmationController } from "./confirmationController.js";
import { HostQuestionController } from "./questionController.js";
import { SettingsStore } from "../persistence/SettingsStore.js";
import { AgentHostIntentDispatcher } from "./dispatcher.js";
import { createBlockingPromptBus } from "../runtime/blockingPrompt.js";
import type { ConfirmPromptBus } from "../runtime/confirmTypes.js";
import type { QuestionPromptBus } from "../runtime/questionTypes.js";
import type { ConfirmRequest, ConfirmResponse } from "../runtime/confirmTypes.js";
import type { AskQuestionRequest, AskQuestionResponse } from "@excelsior/core";
import type { StorageEngine } from "../persistence/storageEngine.js";
import type { RunRecorder } from "../persistence/runRecorder.js";

export class LocalAgentHost implements AgentHost {
  private readonly application: AgentApplication;
  private readonly settings: SettingsStore;
  private readonly confirmations: HostConfirmationController;
  private readonly questions: HostQuestionController;
  private readonly commandExecutor: AgentCommandExecutor;
  private readonly dispatcher: AgentHostIntentDispatcher;
  private readonly listeners = new Set<() => void>();
  private snapshot: AgentClientState | null = null;
  private readonly unsubscribeApplication: () => void;

  constructor(options: {
    workspaceId?: string;
    settingsStore?: SettingsStore;
    application?: AgentApplication;
    confirmBus?: ConfirmPromptBus;
    questionBus?: QuestionPromptBus;
    storageEngine?: StorageEngine;
    recorder?: RunRecorder;
  } = {}) {
    const confirmBus = options.confirmBus ?? createBlockingPromptBus<ConfirmRequest, ConfirmResponse>();
    const questionBus = options.questionBus ?? createBlockingPromptBus<AskQuestionRequest, AskQuestionResponse>();

    this.application =
      options.application ??
      new AgentApplication(options.workspaceId, {
        confirmBus,
        questionBus,
        storageEngine: options.storageEngine,
        recorder: options.recorder,
      });
    this.settings = options.settingsStore ?? new SettingsStore();
    this.confirmations = new HostConfirmationController(
      confirmBus,
      () => this.invalidateAndNotify(),
    );
    this.questions = new HostQuestionController(
      questionBus,
      () => this.invalidateAndNotify(),
    );
    this.commandExecutor = new AgentCommandExecutor({
      application: this.application,
    });
    this.dispatcher = new AgentHostIntentDispatcher({
      application: this.application,
      settings: this.settings,
      confirmations: this.confirmations,
      questions: this.questions,
      commandExecutor: this.commandExecutor,
    });
    this.unsubscribeApplication = this.application.subscribe(() =>
      this.invalidateAndNotify(),
    );
  }

  getState(): AgentClientState {
    if (this.snapshot) return this.snapshot;

    this.snapshot = createAgentClientState(
      this.application.getSnapshot(),
      this.confirmations.pending,
      this.questions.pending,
    );
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getCatalog(): AgentHostCatalog {
    return {
      commands: this.commandExecutor.getDefinitions(),
      settings: this.settings.getSettings(),
    };
  }

  async dispatch(intent: AgentHostIntent): Promise<AgentHostDispatchResult> {
    return this.dispatcher.dispatch(intent);
  }

  dispose(): void {
    this.unsubscribeApplication();
    this.confirmations.dispose();
    this.questions.dispose();
    this.listeners.clear();
    this.application.dispose();
  }

  private invalidateAndNotify(): void {
    this.snapshot = null;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
