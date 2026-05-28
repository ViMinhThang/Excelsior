import { Octokit } from "@octokit/rest";
import { execFile } from "child_process";
import { getSetting } from "../persistence/db.js";
import type { ReviewCommandServices } from "../commands/types.js";

export class GitHubClient implements ReviewCommandServices {
  private _octokit: Octokit | null = null;
  private _owner: string | null = null;
  private _repo: string | null = null;

  constructor(
    private readonly config: {
      githubToken?: string;
      owner?: string;
      repo?: string;
    } = {},
  ) {}

  private getToken(): string {
    if (this.config.githubToken) return this.config.githubToken;
    const fromDb = getSetting("GITHUB_TOKEN");
    if (fromDb) return fromDb;
    const fromEnv = process.env.GITHUB_TOKEN;
    if (fromEnv) return fromEnv;
    throw new Error(
      "GITHUB_TOKEN is not set. Configure it in Settings (Ctrl+S) or set the GITHUB_TOKEN environment variable.",
    );
  }

  private async getOctokit(): Promise<Octokit> {
    if (!this._octokit) {
      this._octokit = new Octokit({ auth: this.getToken() });
    }
    return this._octokit;
  }

  private async execPromise(command: string): Promise<{ stdout: string }> {
    const parts = command.split(" ");
    const cmd = parts[0];
    const args = parts.slice(1);
    return new Promise((resolve, reject) => {
      execFile(cmd, args, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error) reject(error);
        else resolve({ stdout });
      });
    });
  }

  private async parseRepoFromRemote(): Promise<{ owner: string; repo: string }> {
    const { stdout } = await this.execPromise("git remote get-url origin");
    const url = stdout.trim();
    const match = url.match(/github\.com[/:](.+?)\/(.+?)(?:\.git)?$/);
    if (!match) {
      throw new Error(`Could not parse owner/repo from git remote: ${url}`);
    }
    return { owner: match[1], repo: match[2] };
  }

  async getRepoInfo(): Promise<{ owner: string; repo: string }> {
    if (this.config.owner && this.config.repo) {
      return { owner: this.config.owner, repo: this.config.repo };
    }
    if (!this._owner || !this._repo) {
      const info = await this.parseRepoFromRemote();
      this._owner = info.owner;
      this._repo = info.repo;
    }
    return { owner: this._owner!, repo: this._repo! };
  }

  async fetchPRDiff(prNumber: number): Promise<string> {
    const octokit = await this.getOctokit();
    const { owner, repo } = await this.getRepoInfo();
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}",
      {
        owner,
        repo,
        pull_number: prNumber,
        mediaType: { format: "diff" },
      },
    );
    return typeof response.data === "string"
      ? response.data
      : String(response.data);
  }

  async postPRComment(prNumber: number, body: string): Promise<string> {
    try {
      const octokit = await this.getOctokit();
      const { owner, repo } = await this.getRepoInfo();
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });
      return "Comment posted successfully.";
    } catch (error: unknown) {
      return `Error posting comment: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
