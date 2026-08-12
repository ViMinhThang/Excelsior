import { z } from "zod";
import { ToolRegistry } from "../registries/registries.js";
import type { HarnessTool } from "../types.js";
import { text } from "../tools/fs.js";
import type { ReflectionMemoryStore } from "./ReflectionMemoryStore.js";

export function createReflectionToolRegistry(
  store: ReflectionMemoryStore,
  onTouchedFile: (filePath: string) => void,
): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(createListMemoryTool(store));
  registry.register(createReadMemoryTool(store));
  registry.register(createWriteMemoryTool(store, onTouchedFile));
  return registry;
}

const emptySchema = z.object({});

function createListMemoryTool(store: ReflectionMemoryStore): HarnessTool<z.infer<typeof emptySchema>> {
  return {
    name: "listMemory",
    description: "List markdown files in the Excelsior reflection memory root.",
    inputSchema: emptySchema,
    async execute() {
      const files = store.listMemoryFiles();
      return text(files.length === 0 ? "Memory is empty." : files.join("\n"));
    },
  };
}

const readMemorySchema = z.object({
  filePath: z.string(),
});

function createReadMemoryTool(store: ReflectionMemoryStore): HarnessTool<z.infer<typeof readMemorySchema>> {
  return {
    name: "readMemory",
    description: "Read a markdown file from the Excelsior reflection memory root.",
    inputSchema: readMemorySchema,
    async execute({ filePath }) {
      return text(store.readMemoryFile(filePath));
    },
  };
}

const writeMemorySchema = z.object({
  filePath: z.string(),
  content: z.string(),
});

function createWriteMemoryTool(
  store: ReflectionMemoryStore,
  onTouchedFile: (filePath: string) => void,
): HarnessTool<z.infer<typeof writeMemorySchema>> {
  return {
    name: "writeMemory",
    description: "Create or overwrite a markdown file inside the Excelsior reflection memory root.",
    inputSchema: writeMemorySchema,
    async execute({ filePath, content }) {
      const touched = store.writeMemoryFile(filePath, content);
      onTouchedFile(touched);
      return text(`Wrote memory file: ${touched}`);
    },
  };
}
