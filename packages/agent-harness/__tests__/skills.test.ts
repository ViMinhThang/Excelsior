import { mkdir, writeFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentHarness } from "../src/harness.js";

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
    expect(snapshot.displayBlocks.length).toBeGreaterThan(0);
    // The displayContent was customized to "Running skill: TestSkill"
    const userBlock = snapshot.displayBlocks.find((b) => b.type === "user");
    expect(userBlock).toBeDefined();
    expect(userBlock?.content).toBe("Running skill: TestSkill");
  });
});
