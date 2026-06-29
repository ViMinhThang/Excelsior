import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { z } from "zod";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { HarnessTool } from "../types.js";

const browserUseSchema = z.object({
  action: z.enum(["navigate", "click", "fill", "screenshot", "content", "close"]),
  url: z.string().optional().describe("URL to navigate to (required for 'navigate')"),
  selector: z.string().optional().describe("CSS, XPath, or text selector (required for 'click' and 'fill')"),
  value: z.string().optional().describe("Text value to input (required for 'fill')"),
  screenshotPath: z.string().optional().describe("Relative path in workspace to save screenshot (defaults to 'screenshot.png')"),
});

export function createBrowserUseTool(): HarnessTool<z.infer<typeof browserUseSchema>> {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  async function ensurePage(): Promise<Page> {
    if (!browser) {
      browser = await chromium.launch({ headless: true });
    }
    if (!context) {
      context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
    }
    if (!page) {
      page = await context.newPage();
    }
    return page;
  }

  async function cleanup(): Promise<void> {
    if (page) {
      await page.close().catch(() => {});
      page = null;
    }
    if (context) {
      await context.close().catch(() => {});
      context = null;
    }
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
  }

  return {
    name: "browserUse",
    description: "Navigate web pages, click elements, fill forms, get visible text content, and take screenshots using Playwright.",
    inputSchema: browserUseSchema,
    async execute(input, ctx) {
      try {
        if (input.action === "close") {
          await cleanup();
          return { content: "Browser closed successfully." };
        }

        const activePage = await ensurePage();

        switch (input.action) {
          case "navigate": {
            if (!input.url) {
              return { content: "Error: URL is required for the 'navigate' action.", isError: true };
            }
            let targetUrl = input.url.trim();
            if (!/^[a-zA-Z]+:\/\//.test(targetUrl)) {
              targetUrl = `https://${targetUrl}`;
            }
            await activePage.goto(targetUrl, {
              waitUntil: "domcontentloaded",
              timeout: 15000,
            });
            const title = await activePage.title();
            return {
              content: `Navigated to ${targetUrl} successfully.\nTitle: ${title}`,
            };
          }

          case "click": {
            if (!input.selector) {
              return { content: "Error: Selector is required for the 'click' action.", isError: true };
            }
            await activePage.click(input.selector, { timeout: 10000 });
            return { content: `Clicked element matching selector: "${input.selector}"` };
          }

          case "fill": {
            if (!input.selector) {
              return { content: "Error: Selector is required for the 'fill' action.", isError: true };
            }
            if (input.value === undefined) {
              return { content: "Error: Value is required for the 'fill' action.", isError: true };
            }
            await activePage.fill(input.selector, input.value, { timeout: 10000 });
            return { content: `Filled element "${input.selector}" with value: "${input.value}"` };
          }

          case "screenshot": {
            const relPath = input.screenshotPath || "screenshot.png";
            const fullPath = join(ctx.workspaceRoot, relPath);
            await mkdir(dirname(fullPath), { recursive: true });
            await activePage.screenshot({ path: fullPath });
            return { content: `Screenshot saved successfully to: ${fullPath}` };
          }

          case "content": {
            const title = await activePage.title();
            const currentUrl = activePage.url();
            const textContent = await activePage.evaluate(() => document.body.innerText);
            return {
              content: `Title: ${title}\nURL: ${currentUrl}\n\nContent:\n${textContent.trim()}`,
            };
          }

          default:
            return { content: `Error: Unknown action "${input.action}"`, isError: true };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: `Browser error during action "${input.action}": ${message}`, isError: true };
      }
    },
  };
}
