import { tool } from "ai";
import { z } from "zod";
import { randomUUID } from "crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { confirmBus } from "../../../lib/confirmBus.js";

export const editSchema = z.object({
  filePath: z.string().describe("Path to file to edit"),
  oldText: z.string().describe("Exact snippet currently in the file to replace"),
  newText: z.string().describe("New text to replace it with"),
});

export const editTool = tool({
  description: "Atomically replaces an exact text block with a new version. Fails if oldText is not perfectly unique in file.",
  inputSchema: editSchema,
  execute: async ({ filePath, oldText, newText }) => {
    if (confirmBus.getListenerCount("request") > 0) {
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
          toolName: "editFile",
          args: JSON.stringify({ filePath }),
        });
      });
      if (!approved) return "Denied by user.";
    }

    const fullPath = path.resolve(process.cwd(), filePath);
    try {
      const content = await fs.readFile(fullPath, "utf-8");
      const occurrences = content.split(oldText).length - 1;

      if (occurrences === 0) {
        return "Error: 'oldText' not found in file. Verify exact matches including spaces/newlines.";
      }
      if (occurrences > 1) {
        return `Error: Found ${occurrences} occurrences of 'oldText'. Please expand 'oldText' to make it unique.`;
      }

      const updated = content.replace(oldText, newText);
      await fs.writeFile(fullPath, updated, "utf-8");
      return `Successfully replaced the block in ${filePath}.`;
    } catch (error: any) {
      return `Error editing file: ${error.message}`;
    }
  },
});
