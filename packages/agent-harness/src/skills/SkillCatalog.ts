import {
  SkillsManager,
  type SkillMetadata,
  type SkillsManagerOptions,
} from "./SkillsManager.js";

export interface SkillCatalogEntry {
  skill: SkillMetadata;
  commandName: string;
  toolName: string;
}

export function sanitizeSkillName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

export function skillCommandName(name: string): string {
  return sanitizeSkillName(name);
}

export function skillToolName(name: string): string {
  return `skill_${sanitizeSkillName(name)}`;
}

export class SkillCatalog {
  private readonly manager: SkillsManager;
  private entries: SkillCatalogEntry[] = [];

  constructor(workspaceRoot?: string, options: SkillsManagerOptions = {}) {
    this.manager = new SkillsManager(workspaceRoot, options);
  }

  static discover(workspaceRoot?: string, options: SkillsManagerOptions = {}): SkillCatalog {
    const catalog = new SkillCatalog(workspaceRoot, options);
    catalog.discover();
    return catalog;
  }

  discover(): void {
    this.manager.discoverSkills();
    this.entries = this.manager.getSkills().map((skill) => ({
      skill,
      commandName: skillCommandName(skill.name),
      toolName: skillToolName(skill.name),
    }));
  }

  getSkills(): SkillMetadata[] {
    return this.entries.map((entry) => entry.skill);
  }

  getEntries(): SkillCatalogEntry[] {
    return [...this.entries];
  }

  getSkillBody(name: string): string | null {
    return this.manager.getSkillBody(name);
  }
}
