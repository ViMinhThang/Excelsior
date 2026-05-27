import type {
  AgentClientState,
  AgentHost,
  AgentHostCatalog,
  AgentHostDispatchResult,
  AgentHostIntent,
} from "@excelsior/client";
import { AgentApplication } from "../application/AgentApplication.js";
import { CommandHostAdapter } from "../application/commands/CommandHostAdapter.js";
import { AgentCommandExecutor } from "../commands.js";
import { createAgentClientState } from "./clientState.js";
import { HostConfirmationController } from "./confirmationController.js";
import { HostQuestionController } from "./questionController.js";
import type { SettingsStore } from "../ports/SettingsStore.js";
import { DefaultSettingsStore } from "../ports/DefaultSettingsStore.js";
import { AgentHostIntentDispatcher } from "./dispatcher.js";

export class LocalAgentHost implements AgentHost {
  private readonly application: AgentApplication;
  private readonly settings: SettingsStore;
  private readonly confirmations: HostConfirmationController;
  private readonly questions: HostQuestionController;
  private readonly commandHost: CommandHostAdapter;
  private readonly commandExecutor: AgentCommandExecutor;
  private readonly dispatcher: AgentHostIntentDispatcher;
  private readonly listeners = new Set<() => void>();
  private snapshot: AgentClientState | null = null;
  private readonly unsubscribeApplication: () => void;

  constructor(
    application = new AgentApplication(),
    settingsStore?: SettingsStore,
  ) {
    this.application = application;
    this.settings = settingsStore ?? new DefaultSettingsStore();
    this.confirmations = new HostConfirmationController(() =>
      this.invalidateAndNotify(),
    );
    this.questions = new HostQuestionController(() =>
      this.invalidateAndNotify(),
    );
    this.commandHost = new CommandHostAdapter(this.application);
    this.commandExecutor = new AgentCommandExecutor({
      host: this.commandHost,
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
