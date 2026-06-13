import type { AgentMode, Workspace } from "@excelsior/core";
import { EventBus } from "../EventBus.js";
import { EventStore } from "../EventStore.js";
import { GitHubReviewService } from "../github.js";
import { LspManager } from "../lsp/LspManager.js";
import { createDeepSeekProvider } from "../provider.js";
import { ReflectionRunManager } from "../reflection/ReflectionRunManager.js";
import { CommandRegistry, ExtensionRegistry, ProviderRegistry, ToolRegistry } from "../registries.js";
import { SessionManager } from "../SessionManager.js";
import { SettingsStore } from "../SettingsStore.js";
import { SkillCatalog } from "../skills/SkillCatalog.js";
import { registerSkills } from "../skills/register.js";
import { FileHarnessStorage } from "../storage.js";
import { createBuiltInCommands } from "../commands.js";
import { createBuiltInTools } from "../tools/index.js";
import type {
  HarnessCommand,
  HarnessConfig,
} from "../types.js";
import type { ActiveRunManager } from "../run/ActiveRunManager.js";

export interface HarnessBootstrapInput {
  config: HarnessConfig;
  activeRun: ActiveRunManager;
  notify(): void;
  sendSkill(input: { content: string; mode: AgentMode; displayContent: string }): Promise<void>;
  currentMode(): AgentMode;
}

export interface HarnessBootstrap {
  storage: FileHarnessStorage;
  workspace: Workspace;
  providers: ProviderRegistry;
  tools: ToolRegistry;
  commands: CommandRegistry;
  sessionManager: SessionManager;
  eventStore: EventStore;
  settingsStore: SettingsStore;
  lsp: LspManager;
  reflectionRun: ReflectionRunManager;
  eventBus: EventBus;
  skillsList?: string;
}

export function bootstrapHarness(input: HarnessBootstrapInput): HarnessBootstrap {
  const storage = new FileHarnessStorage(input.config.dataDir);
  const workspace = storage.getOrCreateWorkspace({
    id: input.config.workspaceId,
    rootPath: input.config.workspaceRoot,
  });
  const providers = new ProviderRegistry();
  const tools = new ToolRegistry();
  const commands = new CommandRegistry();
  const sessionManager = new SessionManager(storage, workspace.id);
  const eventStore = new EventStore(storage, workspace.id);
  const settingsStore = new SettingsStore(storage);
  const lsp = LspManager.create(workspace.rootPath);
  const reflectionRun = new ReflectionRunManager({
    workspace,
    storage,
    sessionManager,
    settingsStore,
    providers,
    onChange: input.notify,
  });
  const extensions = new ExtensionRegistry(providers, tools, commands);
  const eventBus = new EventBus(
    workspace.id,
    sessionManager,
    eventStore,
    extensions,
    input.notify,
    (runId) => input.activeRun.isRunFinalized(runId),
  );

  registerBuiltIns({ providers, tools });
  const { skillsList } = registerWorkspaceSkills({
    workspaceRoot: workspace.rootPath,
    skillsReader: input.config.skillsReader,
    tools,
    commands,
    sendSkill: input.sendSkill,
    currentMode: input.currentMode,
  });
  for (const command of createHarnessCommands({
    config: input.config,
    commands,
    settingsStore,
  })) {
    commands.register(command);
  }

  extensions.load(input.config.extensions ?? []);
  loadCurrentSessionEvents({ storage, workspace, sessionManager, eventStore });

  return {
    storage,
    workspace,
    providers,
    tools,
    commands,
    sessionManager,
    eventStore,
    settingsStore,
    lsp,
    reflectionRun,
    eventBus,
    ...(skillsList ? { skillsList } : {}),
  };
}

function registerBuiltIns(input: {
  providers: ProviderRegistry;
  tools: ToolRegistry;
}): void {
  input.providers.register(createDeepSeekProvider());
  for (const tool of createBuiltInTools()) input.tools.register(tool);
}

function registerWorkspaceSkills(input: {
  workspaceRoot: string;
  skillsReader: HarnessConfig["skillsReader"];
  tools: ToolRegistry;
  commands: CommandRegistry;
  sendSkill(input: { content: string; mode: AgentMode; displayContent: string }): Promise<void>;
  currentMode(): AgentMode;
}): { skillsList?: string } {
  const skillCatalog = SkillCatalog.discover(input.workspaceRoot, { reader: input.skillsReader });
  const skills = skillCatalog.getSkills();
  if (skills.length === 0) return {};

  const skillsList = skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");
  registerSkills(
    skillCatalog,
    input.tools,
    input.commands,
    async (body, name) => {
      await input.sendSkill({
        content: body,
        mode: input.currentMode(),
        displayContent: `Running skill: ${name}`,
      });
    },
  );
  return { skillsList };
}

function createHarnessCommands(input: {
  config: HarnessConfig;
  commands: CommandRegistry;
  settingsStore: SettingsStore;
}): HarnessCommand[] {
  const reviewServices = input.config.reviewServices ?? new GitHubReviewService(() => {
    const token = input.settingsStore.settings.githubToken || process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN is not configured.");
    }
    return token;
  });
  return createBuiltInCommands({
    getDefinitions: () => input.commands.list(),
    reviewServices,
  });
}

function loadCurrentSessionEvents(input: {
  storage: FileHarnessStorage;
  workspace: Workspace;
  sessionManager: SessionManager;
  eventStore: EventStore;
}): void {
  const session = input.sessionManager.currentSession();
  if (!session) {
    input.eventStore.replaceEvents(null, []);
    return;
  }

  input.eventStore.replaceEvents(
    session,
    input.storage.loadEvents(input.workspace.id, session.id),
  );
}
