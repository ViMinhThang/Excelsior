import { tool } from "ai";
import { z } from "zod";
import type { ToolContext, ToolCapability } from "./context.js";
import { authorizeToolAction, type ToolModePolicy } from "./policy.js";

export interface ToolDefinition<TSchema extends z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: TSchema;
  capability?: ToolCapability;
  modePolicy?: ToolModePolicy;
  errorAction?: string;
  execute: (input: z.infer<TSchema>, ctx: ToolContext | undefined) => Promise<string> | string;
}

export function defineTool<TSchema extends z.ZodTypeAny>(def: ToolDefinition<TSchema>) {
  return (ctx?: ToolContext) => {
    return tool({
      description: def.description,
      inputSchema: def.inputSchema,
      execute: async (input) => {
        if (def.capability || def.modePolicy) {
          const auth = await authorizeToolAction(ctx, {
            toolName: def.name,
            capability: def.capability ?? "fs:read",
            modePolicy: def.modePolicy ?? "read",
          });
          if (!auth.allowed) return auth.message;
        }

        try {
          return await def.execute(input as z.infer<TSchema>, ctx);
        } catch (error: unknown) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          const prefix = def.errorAction ? `Error ${def.errorAction}` : `Error running ${def.name}`;
          return `${prefix}: ${errorMsg}`;
        }
      },
    });
  };
}
