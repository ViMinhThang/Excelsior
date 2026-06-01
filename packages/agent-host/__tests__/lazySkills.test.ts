import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import * as fs from "node:fs";
import { join } from "path";
import { tmpdir } from "os";
import { SkillsManager } from "../src/agent/skills/SkillsManager.js";
import { createAgent } from "../src/agent/agent.js";
import { executeTool, type ToolContext } from "../src/testing/tools.js";
import { AgentCommandExecutor } from "../src/commands/executor.js";

describe("SkillsManager & lazy load skills", () => {
  let tempWorkspace: string;
  let tempHome: string;
  let tempSystem: string;

  beforeEach(async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), "excelsior-ws-"));
    tempHome = await mkdtemp(join(tmpdir(), "excelsior-home-"));
    tempSystem = await mkdtemp(join(tmpdir(), "excelsior-system-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempWorkspace, { recursive: true, force: true });
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempSystem, { recursive: true, force: true });
  });

  it("should parse metadata and lazy load skill from different scopes prioritizing Repo > User > System", async () => {
    // 1. Setup a skill in System scope
    const systemSkillsDir = join(tempSystem, "my-skill");
    await fs.promises.mkdir(systemSkillsDir, { recursive: true });
    await fs.promises.writeFile(
      join(systemSkillsDir, "SKILL.md"),
      `---
name: my-skill
description: System-level skill description
---
# System instructions`,
      "utf-8",
    );

    // 2. Setup a skill in User scope
    const userSkillsDir = join(tempHome, ".agents", "my-skill");
    await fs.promises.mkdir(userSkillsDir, { recursive: true });
    await fs.promises.writeFile(
      join(userSkillsDir, "SKILL.md"),
      `---
name: my-skill
description: User-level skill description
---
# User instructions`,
      "utf-8",
    );

    // Test priority override: Repo > User > System
    // First, let's discover without Repo (should pick User)
    const managerNoRepo = new SkillsManager(undefined, {
      homeDir: tempHome,
      systemDir: tempSystem,
    });
    managerNoRepo.discoverSkills();
    const skillsNoRepo = managerNoRepo.getSkills();

    expect(skillsNoRepo).toHaveLength(1);
    expect(skillsNoRepo[0]).toMatchObject({
      name: "my-skill",
      description: "User-level skill description",
      shortDescription: "User-level skill description.",
      scope: "User",
    });

    const bodyNoRepo = managerNoRepo.getSkillBody("my-skill");
    expect(bodyNoRepo).toBe(
      `<skill>\n  <name>my-skill</name>\n  <instructions>\n# User instructions\n  </instructions>\n</skill>`,
    );

    // Second, let's add Repo skill and verify Repo overrides User
    const repoSkillsDir = join(tempWorkspace, ".agents", "skills", "my-skill");
    await fs.promises.mkdir(repoSkillsDir, { recursive: true });
    await fs.promises.writeFile(
      join(repoSkillsDir, "SKILL.md"),
      `---
name: my-skill
description: Repo-level skill description
---
# Repo instructions`,
      "utf-8",
    );

    const managerWithRepo = new SkillsManager(tempWorkspace, {
      homeDir: tempHome,
      systemDir: tempSystem,
    });
    managerWithRepo.discoverSkills();
    const skillsWithRepo = managerWithRepo.getSkills();

    expect(skillsWithRepo).toHaveLength(1);
    expect(skillsWithRepo[0]).toMatchObject({
      name: "my-skill",
      description: "Repo-level skill description",
      shortDescription: "Repo-level skill description.",
      scope: "Repo",
    });

    const bodyWithRepo = managerWithRepo.getSkillBody("my-skill");
    expect(bodyWithRepo).toBe(
      `<skill>\n  <name>my-skill</name>\n  <instructions>\n# Repo instructions\n  </instructions>\n</skill>`,
    );
  });

  it("should ignore disabled skills", async () => {
    const repoSkillsDir = join(tempWorkspace, ".agents", "skills", "disabled-skill");
    await fs.promises.mkdir(repoSkillsDir, { recursive: true });
    await fs.promises.writeFile(
      join(repoSkillsDir, "SKILL.md"),
      `---
name: disabled-skill
description: I am disabled
enabled: false
---
# Disabled instructions`,
      "utf-8",
    );

    const manager = new SkillsManager(tempWorkspace, {
      homeDir: tempHome,
      systemDir: tempSystem,
    });
    manager.discoverSkills();
    const skills = manager.getSkills();

    expect(skills).toHaveLength(0);
    expect(manager.getSkillBody("disabled-skill")).toBeNull();
  });

  it("should integrate dynamic tools and instructions into createAgent", async () => {
    // Setup a skill in Repo scope
    const repoSkillsDir = join(tempWorkspace, ".agents", "skills", "code-reviewer");
    await fs.promises.mkdir(repoSkillsDir, { recursive: true });
    await fs.promises.writeFile(
      join(repoSkillsDir, "SKILL.md"),
      `---
name: code-reviewer
description: Automated code review skill
---
# Review rules`,
      "utf-8",
    );

    const ctx: ToolContext = {
      capabilities: new Set(["fs:read"]),
      workspaceRoot: tempWorkspace,
      mode: "plan",
    };

    const agent = createAgent("custom instructions", {}, ctx);
    const toolLoopAgent = Reflect.get(agent, "agent") as {
      tools: Record<string, { execute?: unknown }>;
    };

    // Check that the Dynamic Skill tool is registered under the correct sanitized name
    expect(toolLoopAgent.tools).toHaveProperty("skill_code-reviewer");

    // Execute the tool and verify XML context injection
    const skillTool = toolLoopAgent.tools["skill_code-reviewer"];
    const result = await executeTool(skillTool, {}, { toolCallId: "test_call" });
    expect(result).toBe(
      `<skill>\n  <name>code-reviewer</name>\n  <instructions>\n# Review rules\n  </instructions>\n</skill>`,
    );
  });

  it("should dynamically register and execute discovered skills as slash commands", async () => {
    // Setup a skill in Repo scope
    const repoSkillsDir = join(tempWorkspace, ".agents", "skills", "grill-me");
    await fs.promises.mkdir(repoSkillsDir, { recursive: true });
    await fs.promises.writeFile(
      join(repoSkillsDir, "SKILL.md"),
      `---
name: grill-me
description: Dynamic grilling skill
---
# Grill questions`,
      "utf-8",
    );

    const application = {
      workspaceRoot: tempWorkspace,
      send: vi.fn(),
      clear: vi.fn(),
      deleteAllSessions: vi.fn(),
      createSession: vi.fn(),
      switchSession: vi.fn(),
      deleteSession: vi.fn(),
      renameSession: vi.fn(),
      getSnapshot: vi.fn(() => ({ mode: "plan" as const })),
      setMode: vi.fn(),
      revertLastTurn: vi.fn(),
      compactCurrentSession: vi.fn(),
    };

    const executor = new AgentCommandExecutor({ application });

    // Verify /help formats the dynamic skill under "Skills"
    const help = executor.getHelpText();
    expect(help).toContain("Skills\n/grill-me - Dynamic grilling skill.\n  usage: /grill-me");

    // Execute the slash command
    const result = await executor.execute("/grill-me");
    expect(result).toEqual({
      handled: true,
      message: "Starting skill: grill-me...",
      clearInput: true,
    });

    expect(application.send).toHaveBeenCalledWith(
      `<skill>\n  <name>grill-me</name>\n  <instructions>\n# Grill questions\n  </instructions>\n</skill>`,
      { displayContent: "Running skill: grill-me" },
    );
  });
});
