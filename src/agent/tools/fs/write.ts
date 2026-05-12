import { tool } from "ai";
import { z } from "zod";
import { randomUUID } from "crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const writeSchema = z.object({
  filePath: z.string().describe("Destination file path"),
  content: z.string().describe("Full content to write into the file"),
});

interface ConfirmBus {
  getListenerCount(event: "request"): number;
  on(event: "response", handler: (resp: { callId: string; approved: boolean }) => void): () => void;
  emit(event: "request", data: { callId: string; toolName: string; args: string }): void;
}

export function createWriteTool(confirmBus?: ConfirmBus) {
  return tool({
    description: "Create or overwrite entire files with provided content. Automatically creates parent directories.",
    inputSchema: writeSchema,
    execute: async ({ filePath, content }) => {
      if (confirmBus && confirmBus.getListenerCount("request") > 0) {
        const callId = randomUUID();
        const approved = await new Promise<boolean>((resolve) => {
          const unsub = confirmBus.on("response", (resp) => {
            if (resp.callId === callId) {
              unsub();
              resolve(resp.approved);
            }
          });
          confirmBus.emit("request", {
            callId,
            toolName: "writeFile",
            args: JSON.stringify({ filePath }),
          });
        });
        if (!approved) return "Denied by user.";
      }

      const fullPath = path.resolve(process.cwd(), filePath);
      try {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");
        return `Successfully wrote ${content.length} characters to ${filePath}`;
      } catch (error: any) {
        return `Error writing file: ${error.message}`;
      }
    },
  });
}
