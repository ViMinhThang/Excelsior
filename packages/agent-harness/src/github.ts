import { execFile } from "node:child_process";
import { Octokit } from "@octokit/rest";
import type { ReviewCommandServices } from "./types.js";

export class GitHubReviewService implements ReviewCommandServices {
  private octokit: Octokit | null = null;
  private owner: string | null = null;
  private repo: string | null = null;

  constructor(private readonly getToken: () => string) {}

  async fetchPRDiff(prNumber: number): Promise<string> {
    const { owner, repo } = await this.getRepoInfo();
    const response = await this.getOctokit().request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}",
      {
        owner,
        repo,
        pull_number: prNumber,
        mediaType: { format: "diff" },
      },
    );
    return typeof response.data === "string" ? response.data : String(response.data);
  }

  async postPRComment(prNumber: number, body: string): Promise<string> {
    const { owner, repo } = await this.getRepoInfo();
    await this.getOctokit().issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
    return "Comment posted successfully.";
  }

  private getOctokit(): Octokit {
    if (!this.octokit) this.octokit = new Octokit({ auth: this.getToken() });
    return this.octokit;
  }

  private async getRepoInfo(): Promise<{ owner: string; repo: string }> {
    if (this.owner && this.repo) return { owner: this.owner, repo: this.repo };
    const remote = await execFileText("git", ["remote", "get-url", "origin"]);
    const match = remote.trim().match(/github\.com[/:](.+?)\/(.+?)(?:\.git)?$/);
    if (!match) throw new Error(`Could not parse owner/repo from git remote: ${remote.trim()}`);
    this.owner = match[1];
    this.repo = match[2];
    return { owner: this.owner, repo: this.repo };
  }
}

function execFileText(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}
