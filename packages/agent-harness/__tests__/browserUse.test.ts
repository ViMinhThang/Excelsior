import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createBrowserUseTool } from "../src/tools/browserUse.js";
import type { ToolExecutionContext } from "../src/types.js";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "excelsior-browserUse-tests-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("browserUse tool", () => {
  it("can navigate, click, fill, read content, take screenshot, and close", async () => {
    const tempDir = await makeTempDir();
    const htmlPath = join(tempDir, "index.html");
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Test Page</title>
      </head>
      <body>
        <h1>Hello World</h1>
        <input id="my-input" type="text" />
        <button id="my-button" onclick="document.querySelector('h1').innerText = 'Clicked!'">Click me</button>
      </body>
      </html>
    `;
    await writeFile(htmlPath, htmlContent);

    const fileUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;

    const tool = createBrowserUseTool();
    const ctx: ToolExecutionContext = {
      workspaceRoot: tempDir,
      mode: "act",
      confirm: async () => ({ callId: "browserUse", approved: true }),
      askQuestion: async () => ({ callId: "q", answer: "", isManual: true, cancelled: true }),
      sendSubAgent: async () => "",
    };

    try {
      // 1. Navigate
      const navResult = await tool.execute({ action: "navigate", url: fileUrl }, ctx);
      if (navResult.isError) {
        console.error("NAVIGATION ERROR:", navResult.content);
      }
      expect(navResult.isError).toBeFalsy();
      expect(navResult.content).toContain("Navigated to");
      expect(navResult.content).toContain("Title: Test Page");

      // 2. Get content
      const contentResult = await tool.execute({ action: "content" }, ctx);
      expect(contentResult.isError).toBeFalsy();
      expect(contentResult.content).toContain("Hello World");

      // 3. Fill input
      const fillResult = await tool.execute({ action: "fill", selector: "#my-input", value: "hello value" }, ctx);
      expect(fillResult.isError).toBeFalsy();
      expect(fillResult.content).toContain("Filled element");

      // 4. Click button and verify content changed
      const clickResult = await tool.execute({ action: "click", selector: "#my-button" }, ctx);
      expect(clickResult.isError).toBeFalsy();

      const postClickContent = await tool.execute({ action: "content" }, ctx);
      expect(postClickContent.content).toContain("Clicked!");

      // 5. Screenshot
      const screenshotName = "my_screenshot.png";
      const screenshotResult = await tool.execute({ action: "screenshot", screenshotPath: screenshotName }, ctx);
      expect(screenshotResult.isError).toBeFalsy();
      expect(existsSync(join(tempDir, screenshotName))).toBe(true);
    } finally {
      // 6. Close
      const closeResult = await tool.execute({ action: "close" }, ctx);
      expect(closeResult.content).toBe("Browser closed successfully.");
    }
  });
});
