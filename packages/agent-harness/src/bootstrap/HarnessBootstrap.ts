import type { AgentMode, Workspace } from "@excelsior/core";
import { EventBus } from "../events/EventBus.js";
import { EventStore } from "../events/EventStore.js";
import { GitHubReviewService } from "../integrations/github.js";
import { LspManager } from "../lsp/LspManager.js";
import { createDeepSeekProvider } from "../integrations/provider.js";
import { ReflectionRunManager } from "../reflection/ReflectionRunManager.js";
import { CommandRegistry, ExtensionRegistry, ProviderRegistry, ToolRegistry } from "../registries/registries.js";
import { SessionManager } from "../harness/SessionManager.js";
import { SettingsStore } from "../harness/SettingsStore.js";
import { SkillCatalog } from "../skills/SkillCatalog.js";
import { registerSkills } from "../skills/register.js";
import { FileHarnessStorage } from "../harness/FileHarnessStorage.js";
import { JsonlEventRepository } from "../repository/JsonlEventRepository.js";
import type { EventRepository } from "../repository/EventRepository.js";
import { createBuiltInCommands } from "../commands/commands.js";
import { createBuiltInTools } from "../tools/index.js";
import type {
  HarnessCommand,
  HarnessConfig,
} from "../types.js";

export interface HarnessBootstrapInput {
  config: HarnessConfig;
  notify(): void;
  sendSkill(input: { content: string; mode: AgentMode; displayContent: string }): Promise<void>;
  currentMode(): AgentMode;
}

export interface HarnessBootstrap {
  storage: FileHarnessStorage;
  eventRepository: EventRepository;
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
  const eventRepository = new JsonlEventRepository(storage.rootDir);
  const workspace = storage.getOrCreateWorkspace({
    id: input.config.workspaceId,
    rootPath: input.config.workspaceRoot,
  });
  const providers = new ProviderRegistry();
  const tools = new ToolRegistry();
  const commands = new CommandRegistry();
  const sessionManager = new SessionManager(eventRepository, workspace.id);
  const eventStore = new EventStore(eventRepository, workspace.id);
  const settingsStore = new SettingsStore(storage);
  const lsp = LspManager.create(workspace.rootPath);
  const reflectionRun = new ReflectionRunManager({
    workspace,
    storage,
    eventRepository,
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
  loadCurrentSessionEvents({ eventRepository, workspace, sessionManager, eventStore });

  return {
    storage,
    eventRepository,
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
  eventRepository: EventRepository;
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
    input.eventRepository.loadEvents(input.workspace.id, session.id),
  );
}
