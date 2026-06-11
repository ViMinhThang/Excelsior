# Skills Flow

This document walks through how Excelsior discovers skills, exposes them to the agent, and runs them from commands or model tool calls.

## 1. Skill Files Live Under `.agents/skills`

Repo-local skills are stored under:

```text
.agents/skills/<skill-name>/SKILL.md
```

Examples in this repo:

```text
.agents/skills/diagnose/SKILL.md
.agents/skills/grill-me/SKILL.md
.agents/skills/improve-codebase-architecture/SKILL.md
```

Each `SKILL.md` is expected to begin with YAML-like frontmatter:

```md
---
name: diagnose
description: Disciplined diagnosis loop for hard bugs and performance regressions.
---

# Skill body...
```

The skill body after the second `---` becomes the detailed instruction text that can later be loaded into an agent run.

## 2. Harness Constructs The Skill Catalog

Skills are initialized when the agent harness is created.

Main file:

- `packages/agent-harness/src/harness.ts`

In the `HarnessStore` constructor:

```ts
this.skillCatalog = SkillCatalog.discover(this.workspace.rootPath, { reader: config.skillsReader });
const skills = this.skillCatalog.getSkills();
```

`this.workspace.rootPath` tells the skill system which repository to scan for repo-local skills.

`config.skillsReader` is optional and mainly exists for tests or alternate file readers.

## 3. SkillCatalog Wraps SkillsManager

Main file:

- `packages/agent-harness/src/skills/SkillCatalog.ts`

`SkillCatalog.discover(...)` creates a catalog and calls `discover()`:

```ts
static discover(workspaceRoot?: string, options: SkillsManagerOptions = {}): SkillCatalog {
  const catalog = new SkillCatalog(workspaceRoot, options);
  catalog.discover();
  return catalog;
}
```

Internally, `SkillCatalog` delegates filesystem discovery to `SkillsManager`:

```ts
this.manager.discoverSkills();
this.entries = this.manager.getSkills().map((skill) => ({
  skill,
  commandName: skillCommandName(skill.name),
  toolName: skillToolName(skill.name),
}));
```

For each discovered skill, the catalog derives:

- a slash command name
- a tool name

The naming helpers are:

```ts
export function sanitizeSkillName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

export function skillCommandName(name: string): string {
  return sanitizeSkillName(name);
}

export function skillToolName(name: string): string {
  return `skill_${sanitizeSkillName(name)}`;
}
```

Example:

```text
Skill name: diagnose
Command:    /diagnose
Tool:       skill_diagnose
```

## 4. SkillsManager Discovers Skills By Scope

Main file:

- `packages/agent-harness/src/skills/SkillsManager.ts`

`SkillsManager.discoverSkills()` scans three locations in priority order:

```ts
// Priority order: System -> User -> Repo. Later stages override earlier ones.
```

The scan locations are:

```text
System: /etc/agents             on Unix-like systems
        C:\ProgramData\agents   on Windows

User:   ~/.agents

Repo:   <workspaceRoot>/.agents/skills
```

Repo skills are only scanned when the harness has a workspace root:

```ts
if (this.workspaceRoot) {
  const repoDir = path.join(this.workspaceRoot, ".agents/skills");
  pathsToScan.push({ dir: repoDir, scope: "Repo" });
}
```

For each directory entry, it looks for:

```text
<skill-folder>/SKILL.md
```

Then it parses that file:

```ts
const parsed = parseSkillFile(skillMdPath, scope, this.reader);
```

Discovered skills are stored in a registry keyed by skill name:

```ts
this.registry.set(parsed.metadata.name, parsed);
```

Because repo scanning happens after system and user scanning, a repo skill with the same name can override an earlier system/user skill.

## 5. SKILL.md Parsing

Main function:

- `parseSkillFile(...)` in `packages/agent-harness/src/skills/SkillsManager.ts`

The parser:

1. Reads the file.
2. Requires it to start with `---`.
3. Finds the second frontmatter divider.
4. Parses simple `key: value` frontmatter lines.
5. Extracts:
   - `name`
   - `description`
   - `enabled`
6. Returns metadata plus body.

Important behavior:

```ts
if (!name) return null;
```

A skill without a `name` is ignored.

The `enabled` flag defaults to `true`:

```ts
let enabled = true;
```

And this disables a skill:

```md
enabled: false
```

`getSkills()` filters disabled skills:

```ts
return Array.from(this.registry.values())
  .map((item) => item.metadata)
  .filter((meta) => meta.enabled);
```

## 6. Skill Bodies Are Loaded Lazily

The skill list is discovered at harness startup, but detailed skill instructions are loaded when needed.

Main method:

- `SkillCatalog.getSkillBody(name)`
- `SkillsManager.getSkillBody(name)`

`SkillsManager.getSkillBody` re-reads the `SKILL.md` file:

```ts
const parsed = parseSkillFile(item.metadata.path, item.metadata.scope, this.reader);
```

That lets changed skill files be picked up when the skill is invoked.

The returned content is wrapped in XML-like tags:

```xml
<skill>
  <name>diagnose</name>
  <instructions>
...
  </instructions>
</skill>
```

That wrapper is what gets inserted into a run when a skill is loaded.

## 7. Harness Builds The Skills List For The System Prompt

Back in:

- `packages/agent-harness/src/harness.ts`

After discovery:

```ts
const skills = this.skillCatalog.getSkills();
if (skills.length > 0) {
  this.skillsList = skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
  registerSkills(...);
}
```

`skillsList` is a short summary list, not the full skill body.

Example:

```text
- diagnose: Disciplined diagnosis loop for hard bugs and performance regressions.
- grill-me: Interview the user relentlessly about a plan or design.
```

This summary is passed into run assembly later:

```ts
skillsList: this.skillsList,
```

File:

- `packages/agent-harness/src/context/runAssembly.ts`

## 8. System Prompt Mentions Available Skills

The system prompt is built by:

- `packages/agent-harness/src/context/contextBuilder.ts`
- `packages/agent-harness/src/context/systemPrompt.ts`

`buildRunContext` passes `skillsList` into `buildSystemPrompt`:

```ts
systemPrompt: buildSystemPrompt({
  mode: input.mode,
  skillsList: input.skillsList,
  projectInstructions: input.projectInstructions,
}),
```

If skills exist, `buildSystemPrompt` appends:

```ts
if (input.skillsList) {
  prompt += `\n## Available Agent Skills
You have access to the following specialized engineering and productivity skills.
To load the detailed instructions for a skill, execute its corresponding tool \`skill_<name>\`
(e.g. \`skill_diagnose\`).\n\n${input.skillsList}\n`;
}
```

So the model sees:

1. Which skills exist.
2. The short description for each skill.
3. The instruction to call `skill_<name>` when it wants detailed instructions.

## 9. Skills Are Registered As Tools And Commands

Main file:

- `packages/agent-harness/src/skills/register.ts`

`registerSkills(...)` receives:

```ts
catalog: SkillCatalog
tools: ToolRegistry
commands: CommandRegistry
sendContent: (content: string, displayName: string) => Promise<void>
```

It registers every skill twice:

1. As a model-callable tool.
2. As a user-callable slash command.

## 10. Skill Tools Let The Model Load Instructions

For every skill, `registerSkills` adds a tool:

```ts
tools.register({
  name: entry.toolName,
  description: entry.skill.description,
  inputSchema: z.object({}),
  capabilities: [],
  execute: async () => {
    const body = catalog.getSkillBody(entry.skill.name);
    return { content: body || `Skill ${entry.skill.name} not found.` };
  },
});
```

Example:

```text
skill_diagnose
```

When the model calls this tool, it receives the full skill body as tool output.

That output then becomes part of the model context through the normal tool result flow.

Relevant run files:

- `packages/agent-harness/src/run/runModelStep.ts`
- `packages/agent-harness/src/run/RunStepRecorder.ts`
- `packages/agent-harness/src/context/RunEventWriter.ts`

## 11. Skill Commands Let The User Start A Skill

For every skill, `registerSkills` also adds a slash command:

```ts
commands.register({
  definition: {
    name: entry.commandName,
    description: entry.skill.shortDescription,
    category: "skills",
  },
  execute: async () => {
    const body = catalog.getSkillBody(entry.skill.name);
    ...
    await sendContent(body, entry.skill.name);
    return {
      handled: true,
      message: `Starting skill: ${entry.skill.name}...`,
      clearInput: true,
    };
  },
});
```

Example:

```text
/diagnose
```

When the user runs a skill command, the command loads the full skill body and sends it as a new agent message.

## 12. How Skill Commands Re-enter The Send Flow

The `sendContent` callback is provided in `harness.ts`:

```ts
async (body, name) => {
  await this.send({
    content: body,
    mode: this.mode,
    displayContent: `Running skill: ${name}`,
  });
}
```

This means a skill command uses the same `HarnessStore.send(...)` path as a normal user message.

Two different contents are used:

- `content`: the full `<skill>...</skill>` instruction body sent to the agent
- `displayContent`: the friendly transcript text shown to the user

Example display text:

```text
Running skill: diagnose
```

The actual model input is the full skill body.

## 13. Skills Also Flow Into Sub-Agents

The tool context includes:

```ts
skillsList: input.skillsList,
```

File:

- `packages/agent-harness/src/context/runAssembly.ts`

Sub-agent process paths also carry `skillsList`:

- `packages/agent-harness/src/subagentProcess.ts`
- `packages/agent-harness/src/subagentChildRunner.ts`

That keeps the same available-skills summary available when sub-agent contexts are assembled.

## Quick Path: Discovery

```text
createAgentHarness
  -> new HarnessStore
  -> SkillCatalog.discover(workspace.rootPath)
  -> SkillsManager.discoverSkills()
  -> scan system/user/repo skill folders
  -> parse SKILL.md frontmatter and body
  -> SkillCatalog entries get command/tool names
  -> harness builds skillsList
  -> registerSkills registers tools and slash commands
```

## Quick Path: Model Loads A Skill

```text
System prompt lists available skills
  -> model decides it needs one
  -> model calls skill_<name>
  -> registered skill tool calls catalog.getSkillBody(name)
  -> SkillsManager loads SKILL.md body
  -> tool result returns <skill>...</skill>
  -> model continues with skill instructions in context
```

## Quick Path: User Runs A Skill Command

```text
User enters /<skill-name>
  -> command registry executes skill command
  -> catalog.getSkillBody(name)
  -> sendContent(body, skillName)
  -> HarnessStore.send({
       content: full skill body,
       displayContent: "Running skill: <name>"
     })
  -> normal run assembly and agent loop
```

## Key Files

- `packages/agent-harness/src/harness.ts`
- `packages/agent-harness/src/skills/SkillCatalog.ts`
- `packages/agent-harness/src/skills/SkillsManager.ts`
- `packages/agent-harness/src/skills/register.ts`
- `packages/agent-harness/src/context/systemPrompt.ts`
- `packages/agent-harness/src/context/contextBuilder.ts`
- `packages/agent-harness/src/context/runAssembly.ts`
- `packages/agent-harness/src/run/runModelStep.ts`
- `packages/agent-harness/src/run/RunStepRecorder.ts`
- `packages/agent-harness/__tests__/skills.test.ts`
