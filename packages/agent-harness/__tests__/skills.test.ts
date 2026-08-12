import { mkdir, writeFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentHarness } from "../src/harness/HarnessStore.js";
import type { ISkillReader } from "../src/types.js";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "excelsior-skills-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("Skills System Integration", () => {
  it("discovers skills and registers tools/commands dynamically", async () => {
    const dataDir = await makeTempDir();
    const workspaceRoot = await makeTempDir();

    // Create a mock skill directory structure
    const skillDir = join(workspaceRoot, ".agents/skills/test-skill");
    await mkdir(skillDir, { recursive: true });

    const skillMdContent = `---
name: TestSkill
description: A mock skill for automated validation.
enabled: true
---
Mock instructions detail.
`;
    await writeFile(join(skillDir, "SKILL.md"), skillMdContent, "utf-8");

    const harness = createAgentHarness({
      dataDir,
      workspaceRoot,
      workspaceId: "ws_test",
    });

    // Check catalog to verify it registers the command definition
    const catalog = harness.getCatalog();
    const commandDef = catalog.commands.find((c) => c.name === "testskill");
    expect(commandDef).toBeDefined();
    expect(commandDef?.category).toBe("skills");

    // Execute the skill tool via execute method on tools registry
    const tool = (harness as any).tools.list().find((t: any) => t.name === "skill_testskill");
    expect(tool).toBeDefined();

    const toolResult = await tool.execute({}, {
      workspaceRoot,
      mode: "act",
    });
    expect(toolResult.content).toContain("<skill>");
    expect(toolResult.content).toContain("<name>TestSkill</name>");
    expect(toolResult.content).toContain("Mock instructions detail.");

    // Execute the command `/testskill` and verify it triggers a turn/send
    const result = await harness.executeCommand("/testskill");
    expect(result.handled).toBe(true);
    expect(result.message).toContain("Starting skill: TestSkill...");

    const snapshot = harness.getSnapshot();
    const blocks = snapshot.turns.flatMap((t) => t.blocks);
    expect(blocks.length).toBeGreaterThan(0);
    // The displayContent was customized to "Running skill: TestSkill"
    const userBlock = blocks.find((b) => b.type === "user");
    expect(userBlock).toBeDefined();
    expect(userBlock?.content).toBe("Running skill: TestSkill");
  });

  it("discovers skills using an InMemorySkillReader without filesystem access", async () => {
    const dataDir = await makeTempDir();

    class InMemorySkillReader implements ISkillReader {
      exists(pathStr: string): boolean {
        const normalized = pathStr.replace(/\\/g, "/").replace(/^[a-zA-Z]:/, "");
        if (normalized === "/virtual/workspace/.agents/skills") return true;
        if (normalized === "/virtual/workspace/.agents/skills/test-virtual-skill") return true;
        if (normalized === "/virtual/workspace/.agents/skills/test-virtual-skill/SKILL.md") return true;
        return false;
      }
      
      readDir(pathStr: string): Array<{ name: string; isDirectory(): boolean }> {
        const normalized = pathStr.replace(/\\/g, "/").replace(/^[a-zA-Z]:/, "");
        if (normalized === "/virtual/workspace/.agents/skills") {
          return [{ name: "test-virtual-skill", isDirectory: () => true }];
        }
        return [];
      }

      readFile(pathStr: string): string {
        const normalized = pathStr.replace(/\\/g, "/").replace(/^[a-zA-Z]:/, "");
        if (normalized === "/virtual/workspace/.agents/skills/test-virtual-skill/SKILL.md") {
          return `---
name: VirtualSkill
description: A mock skill resolved completely from in-memory virtual loader.
enabled: true
---
Virtual instructions detail.
`;
        }
        throw new Error(`File not found: ${pathStr}`);
      }
    }

    const skillsReader = new InMemorySkillReader();

    const harness = createAgentHarness({
      dataDir,
      workspaceRoot: "/virtual/workspace",
      workspaceId: "ws_virtual_test",
      skillsReader,
    });

    const catalog = harness.getCatalog();
    const commandDef = catalog.commands.find((c) => c.name === "virtualskill");
    expect(commandDef).toBeDefined();
    expect(commandDef?.category).toBe("skills");

    const tool = (harness as any).tools.list().find((t: any) => t.name === "skill_virtualskill");
    expect(tool).toBeDefined();

    const toolResult = await tool.execute({}, {
      workspaceRoot: "/virtual/workspace",
      mode: "act",
    } as any);
    expect(toolResult.content).toContain("<skill>");
    expect(toolResult.content).toContain("<name>VirtualSkill</name>");
    expect(toolResult.content).toContain("Virtual instructions detail.");
  });
});
