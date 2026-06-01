import type {
  AgentClientState,
  AgentHost,
  AgentHostCatalog,
  AgentHostDispatchResult,
  AgentHostIntent,
} from "@excelsior/client";
import { AgentApplication } from "../application/AgentApplication.js";
import { AgentCommandExecutor } from "../commands/executor.js";
import { createAgentClientState } from "./clientState.js";
import { HostBlockingPromptController } from "./BlockingPromptController.js";
import { SettingsStore, type StorageEngine, type RunRecorder } from "@excelsior/agent-storage";
import { createIntentDispatcher } from "./dispatcher.js";
import { IntentRegistry } from "./intentRegistry.js";
import {
  createBlockingPromptBus,
  type ConfirmPromptBus,
  type QuestionPromptBus,
  type ConfirmRequest,
  type ConfirmResponse,
} from "../runtime/blockingPrompt.js";
import type { AskQuestionRequest, AskQuestionResponse } from "@excelsior/core";

export class LocalAgentHost implements AgentHost {
  private readonly application: AgentApplication;
  private readonly settings: SettingsStore;
  private readonly confirmations: HostBlockingPromptController<ConfirmRequest, ConfirmResponse>;
  private readonly questions: HostBlockingPromptController<AskQuestionRequest, AskQuestionResponse>;
  private readonly commandExecutor: AgentCommandExecutor;
  private readonly dispatcher: IntentRegistry;
  private readonly listeners = new Set<() => void>();
  private snapshot: AgentClientState | null = null;
  private readonly unsubscribeApplication: () => void;
  private autoApproveConfirmations = false;

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
    this.confirmations = new HostBlockingPromptController(
      confirmBus,
      () => this.invalidateAndNotify(),
      (request) =>
        this.autoApproveConfirmations
          ? { callId: request.callId, approved: true }
          : null,
    );
    this.questions = new HostBlockingPromptController(
      questionBus,
      () => this.invalidateAndNotify(),
    );
    this.commandExecutor = new AgentCommandExecutor({
      application: this.application,
    });
    this.dispatcher = createIntentDispatcher({
      application: this.application,
      settings: this.settings,
      confirmations: {
        respond: (callId, approved) => this.confirmations.respond({ callId, approved }),
        approveAll: () => this.approveAllConfirmations(),
      },
      questions: {
        respond: (response) => this.questions.respond(response),
      },
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

  approveAllConfirmations(): void {
    this.autoApproveConfirmations = true;
    if (this.confirmations.pending) {
      this.confirmations.respond({
        callId: this.confirmations.pending.callId,
        approved: true,
      });
    }
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
