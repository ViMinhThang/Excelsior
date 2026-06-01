import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface SkillMetadata {
  name: string;
  description: string;
  shortDescription: string;
  path: string;
  scope: "Repo" | "User" | "System" | "Admin";
  enabled: boolean;
}

export interface SkillsManagerOptions {
  homeDir?: string;
  systemDir?: string;
  programDataDir?: string;
}

export function truncateDescription(desc: string, maxLen = 80): string {
  if (!desc) return "";
  const firstSentence = desc.split(".")[0].trim();
  if (firstSentence.length > maxLen) {
    return firstSentence.slice(0, maxLen - 3) + "...";
  }
  return firstSentence.endsWith(".") ? firstSentence : firstSentence + ".";
}

export function parseSkillFile(
  filePath: string,
  scope: "Repo" | "User" | "System" | "Admin",
): { metadata: SkillMetadata; body: string } | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const normalized = content.replace(/\r\n/g, "\n").trim();
    if (!normalized.startsWith("---")) return null;

    const secondDividerIndex = normalized.indexOf("\n---", 3);
    if (secondDividerIndex === -1) return null;

    const frontmatterText = normalized.substring(3, secondDividerIndex).trim();
    const body = normalized.substring(secondDividerIndex + 4).trim();

    const lines = frontmatterText.split("\n");
    let name = "";
    let description = "";
    let enabled = true;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith("#")) continue;

      const colonIndex = trimmedLine.indexOf(":");
      if (colonIndex === -1) continue;

      const key = trimmedLine.substring(0, colonIndex).trim();
      let value = trimmedLine.substring(colonIndex + 1).trim();

      // Strip quotes
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }

      if (key === "name") {
        name = value;
      } else if (key === "description") {
        description = value;
      } else if (key === "enabled") {
        enabled = value.toLowerCase() !== "false";
      }
    }

    if (!name) return null;

    return {
      metadata: {
        name,
        description,
        shortDescription: truncateDescription(description),
        path: filePath,
        scope,
        enabled,
      },
      body,
    };
  } catch {
    return null;
  }
}

export class SkillsManager {
  private readonly workspaceRoot: string | null;
  private readonly registry = new Map<string, { metadata: SkillMetadata; body: string }>();

  constructor(
    workspaceRoot?: string,
    private readonly options: SkillsManagerOptions = {},
  ) {
    this.workspaceRoot = workspaceRoot ? path.resolve(workspaceRoot) : null;
  }

  discoverSkills(): void {
    this.registry.clear();

    // Priority order: System -> User -> Repo. Later stages override earlier ones.
    const pathsToScan: Array<{ dir: string; scope: "Repo" | "User" | "System" | "Admin" }> = [];

    // 1. System path
    const systemDir = this.options.systemDir ?? (
      process.platform === "win32"
        ? path.join(
            this.options.programDataDir ?? process.env.PROGRAMDATA ?? "C:\\ProgramData",
            "agents",
          )
        : "/etc/agents"
    );
    pathsToScan.push({ dir: systemDir, scope: "System" });

    // 2. User path
    const userDir = path.join(this.options.homeDir ?? os.homedir(), ".agents");
    pathsToScan.push({ dir: userDir, scope: "User" });

    // 3. Repo path
    if (this.workspaceRoot) {
      const repoDir = path.join(this.workspaceRoot, ".agents/skills");
      pathsToScan.push({ dir: repoDir, scope: "Repo" });
    }

    for (const { dir, scope } of pathsToScan) {
      if (!fs.existsSync(dir)) continue;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillMdPath = path.join(dir, entry.name, "SKILL.md");
            if (fs.existsSync(skillMdPath)) {
              const parsed = parseSkillFile(skillMdPath, scope);
              if (parsed) {
                // Register in registry (higher scope priority naturally overwrites)
                this.registry.set(parsed.metadata.name, parsed);
              }
            }
          }
        }
      } catch {
        // Gracefully continue scanning other directories
      }
    }
  }

  getSkills(): SkillMetadata[] {
    return Array.from(this.registry.values())
      .map((item) => item.metadata)
      .filter((meta) => meta.enabled);
  }

  getSkillBody(name: string): string | null {
    const item = this.registry.get(name);
    if (!item || !item.metadata.enabled) return null;

    // Lazily read SKILL.md to ensure we get any live changes!
    try {
      const parsed = parseSkillFile(item.metadata.path, item.metadata.scope);
      if (parsed) {
        // Update in registry
        this.registry.set(name, parsed);
        return `<skill>\n  <name>${name}</name>\n  <instructions>\n${parsed.body.trim()}\n  </instructions>\n</skill>`;
      }
    } catch {
      // Fallback to cached body if reading fails
    }

    return `<skill>\n  <name>${name}</name>\n  <instructions>\n${item.body.trim()}\n  </instructions>\n</skill>`;
  }
}
