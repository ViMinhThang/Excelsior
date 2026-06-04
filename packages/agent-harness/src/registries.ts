import type { ToolSet } from "ai";
import { tool } from "ai";
import type {
  HarnessCommand,
  HarnessExtension,
  HarnessExtensionApi,
  HarnessProvider,
  HarnessTool,
  ToolExecutionContext,
} from "./types.js";
import type { HarnessEvent } from "./events.js";

export class ProviderRegistry {
  private readonly providers = new Map<string, HarnessProvider>();
  private defaultProviderId = "deepseek";

  register(provider: HarnessProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider already registered: ${provider.id}`);
    }
    this.providers.set(provider.id, provider);
  }

  get(id = this.defaultProviderId): HarnessProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Unknown provider: ${id}`);
    return provider;
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, HarnessTool>();

  register(toolDefinition: HarnessTool): void {
    if (this.tools.has(toolDefinition.name)) {
      throw new Error(`Tool already registered: ${toolDefinition.name}`);
    }
    this.tools.set(toolDefinition.name, toolDefinition);
  }

  list(): HarnessTool[] {
    return [...this.tools.values()];
  }

  toToolSet(ctx: ToolExecutionContext): ToolSet {
    const result: Record<string, unknown> = {};
    for (const harnessTool of this.tools.values()) {
      result[harnessTool.name] = tool({
        description: harnessTool.description,
        inputSchema: harnessTool.inputSchema,
        execute: async (input, options) => {
          const parsed = harnessTool.inputSchema.parse(input);
          const output = await harnessTool.execute(parsed, ctx, options);
          if (output.isError) {
            throw new Error(output.content);
          }
          return output.content;
        },
      });
    }
    return result as ToolSet;
  }
}

export class CommandRegistry {
  private readonly commands = new Map<string, HarnessCommand>();

  register(command: HarnessCommand): void {
    const name = command.definition.name.toLowerCase();
    if (this.commands.has(name)) {
      throw new Error(`Command already registered: ${command.definition.name}`);
    }
    this.commands.set(name, command);
  }

  list() {
    return [...this.commands.values()].map((command) => command.definition);
  }

  get(name: string): HarnessCommand | undefined {
    return this.commands.get(name.toLowerCase());
  }
}

export class ExtensionRegistry implements HarnessExtensionApi {
  private readonly listeners = new Set<(event: HarnessEvent) => void>();

  constructor(
    private readonly providers: ProviderRegistry,
    private readonly tools: ToolRegistry,
    private readonly commands: CommandRegistry,
  ) {}

  load(extensions: readonly HarnessExtension[]): void {
    for (const extension of extensions) {
      extension.register(this);
    }
  }

  registerTool(toolDefinition: HarnessTool): void {
    this.tools.register(toolDefinition);
  }

  registerCommand(command: HarnessCommand): void {
    this.commands.register(command);
  }

  registerProvider(provider: HarnessProvider): void {
    this.providers.register(provider);
  }

  onEvent(handler: (event: HarnessEvent) => void): void {
    this.listeners.add(handler);
  }

  emit(event: HarnessEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
