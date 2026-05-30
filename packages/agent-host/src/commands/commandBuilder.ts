import type { CommandResult } from "@excelsior/core";
import type { AgentCommand, CommandHandler } from "./types.js";

export interface ParameterDefinition {
  name: string;
  required: boolean;
  isRest: boolean;
  type: "string" | "number" | "boolean";
}

export function parseSignature(signature: string): ParameterDefinition[] {
  if (!signature || !signature.trim()) return [];
  return signature.trim().split(/\s+/).map((token) => {
    const isRequired = token.startsWith("<") && token.endsWith(">");
    const isOptional = token.startsWith("[") && token.endsWith("]");
    
    if (!isRequired && !isOptional) {
      throw new Error(`Invalid token in signature: "${token}". Must be enclosed in <...> or [...]`);
    }

    let inner = token.slice(1, -1);
    const isRest = inner.endsWith("...");
    if (isRest) {
      inner = inner.slice(0, -3);
    }

    const colonIndex = inner.indexOf(":");
    let name = inner;
    let type: "string" | "number" | "boolean" = "string";

    if (colonIndex !== -1) {
      name = inner.slice(0, colonIndex);
      const typeStr = inner.slice(colonIndex + 1);
      if (typeStr === "number" || typeStr === "boolean") {
        type = typeStr;
      }
    }

    return { name, required: isRequired, isRest, type };
  });
}

export function parseArguments(
  defs: ParameterDefinition[],
  args: string[]
): { success: true; values: Record<string, any> } | { success: false; error: string } {
  const values: Record<string, any> = {};

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];

    if (def.isRest) {
      const remaining = args.slice(i);
      if (def.required && remaining.length === 0) {
        return { success: false, error: `Missing required argument: <${def.name}>` };
      }
      values[def.name] = remaining.join(" ");
      break; // rest consumes all remaining
    }

    const val = args[i];
    if (val === undefined) {
      if (def.required) {
        return { success: false, error: `Missing required argument: <${def.name}>` };
      }
      values[def.name] = undefined;
      continue;
    }

    if (def.type === "number") {
      const num = Number(val);
      if (Number.isNaN(num)) {
        return { success: false, error: `Argument <${def.name}> must be a valid number (got "${val}")` };
      }
      values[def.name] = num;
    } else if (def.type === "boolean") {
      if (val === "true" || val === "1") {
        values[def.name] = true;
      } else if (val === "false" || val === "0") {
        values[def.name] = false;
      } else {
        return { success: false, error: `Argument <${def.name}> must be a boolean (got "${val}")` };
      }
    } else {
      values[def.name] = val;
    }
  }

  return { success: true, values };
}

interface SubCommandDef<Context> {
  name: string;
  argString: string;
  paramDefs: ParameterDefinition[];
  handler: CommandHandler<Context>;
}

export class CommandBuilder<Context> {
  private _category = "general";
  private _description = "";
  private _signature = "";
  private _paramDefs: ParameterDefinition[] = [];
  private _subCommands: SubCommandDef<Context>[] = [];
  private _defaultHandler?: CommandHandler<Context>;

  constructor(private readonly commandName: string) {}

  category(category: string): this {
    this._category = category;
    return this;
  }

  description(desc: string): this {
    this._description = desc;
    return this;
  }

  signature(sig: string): this {
    this._signature = sig;
    this._paramDefs = parseSignature(sig);
    return this;
  }

  subCommand(
    name: string | string[],
    argString: string,
    handler: CommandHandler<Context>,
  ): this {
    const names = Array.isArray(name) ? name : [name];
    const paramDefs = parseSignature(argString);
    for (const n of names) {
      this._subCommands.push({ name: n.toLowerCase(), argString, paramDefs, handler });
    }
    return this;
  }

  default(handler: CommandHandler<Context>): this {
    this._defaultHandler = handler;
    return this;
  }

  build(): AgentCommand {
    // Generate usage string
    const usages: string[] = [];
    if (this._defaultHandler) {
      const mainArgs = this._signature ? ` ${this._signature}` : "";
      usages.push(`/${this.commandName}${mainArgs}`);
    }
    
    // De-duplicate usage definitions by (name + argString) ignoring aliases to keep usage clean
    for (const sub of this._subCommands) {
      // Don't show empty/alias names in usage if they are just "" mapping to default behaviour
      if (sub.name === "") continue;
      
      const args = sub.argString ? ` ${sub.argString}` : "";
      usages.push(`/${this.commandName} ${sub.name}${args}`);
    }
    
    // If no usages were pushed (e.g. no default and no named subs), just put the command name
    if (usages.length === 0) {
      usages.push(`/${this.commandName}`);
    }

    const usageString = usages.join(" | ");

    return {
      definition: {
        name: this.commandName,
        category: this._category,
        description: this._description,
        usage: usageString,
      },
      execute: (args: string[], context: any) => {
        const subName = (args[0] || "").toLowerCase();
        
        // Find matching subcommand
        const sub = this._subCommands.find((s) => s.name === subName);
        
        if (sub) {
          const subArgs = args.slice(1);
          const parseResult = parseArguments(sub.paramDefs, subArgs);
          if (!parseResult.success) {
            const commandUsage = `/${this.commandName} ${sub.name}${sub.argString ? ` ${sub.argString}` : ""}`;
            return {
              handled: true,
              message: `${parseResult.error}\nUsage: ${commandUsage}`,
              clearInput: true,
            };
          }
          return sub.handler(parseResult.values, context, subArgs);
        }

        if (this._subCommands.length > 0 && !this._defaultHandler) {
          return {
            handled: true,
            message: `Unknown subcommand "${subName}".\nUsage: ${usageString}`,
            clearInput: true,
          };
        }

        if (this._defaultHandler) {
          const parseResult = parseArguments(this._paramDefs, args);
          if (!parseResult.success) {
            const commandUsage = `/${this.commandName}${this._signature ? ` ${this._signature}` : ""}`;
            return {
              handled: true,
              message: `${parseResult.error}\nUsage: ${commandUsage}`,
              clearInput: true,
            };
          }
          return this._defaultHandler(parseResult.values, context, args);
        }

        return {
          handled: true,
          message: `Usage: ${usageString}`,
          clearInput: true,
        };
      },
    };
  }
}
