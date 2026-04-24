import { Octokit } from "octokit";
import { execSync } from "node:child_process";
import { loadConfig } from "../config.js";

export interface PullRequestData {
  owner: string;
  repo: string;
  pull_number: number;
  title: string;
  body: string;
  diff: string;
}

export class GitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async getPullRequest(
    owner: string,
    repo: string,
    pull_number: number,
  ): Promise<PullRequestData> {
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number,
    });

    const { data: diff } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number,
      mediaType: {
        format: "diff",
      },
    });

    return {
      owner,
      repo,
      pull_number,
      title: pr.title,
      body: pr.body || "",
      diff: diff as unknown as string,
    };
  }

  async postComment(
    owner: string,
    repo: string,
    pull_number: number,
    body: string,
  ) {
    await this.octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body,
    });
  }

  async postReviewComment(
    owner: string,
    repo: string,
    pull_number: number,
    commit_id: string,
    path: string,
    line: number,
    body: string,
  ) {
    await this.octokit.rest.pulls.createReviewComment({
      owner,
      repo,
      pull_number,
      body,
      commit_id,
      path,
      line,
      side: "RIGHT",
    });
  }

  async fetchPRs(owner: string, repo: string): Promise<PullRequest[]> {
    const { data: prs } = await this.octokit.rest.pulls.list({
      owner,
      repo,
      state: "open",
    });
    return prs.map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.user?.login || "unknown",
      status: pr.state,
    }));
  }
}

export interface PullRequest {
  number: number;
  title: string;
  author: string;
  status: string;
}

export interface RepoInfo {
  owner: string;
  repo: string;
}

export function getRepoInfo(): RepoInfo | null {
  try {
    const remoteUrl = execSync("git remote get-url origin", {
      encoding: "utf8",
    }).trim();
    const match = remoteUrl.match(/github\.com[/:]([^/]+)\/([^.]+)(\.git)?/);

    if (match) {
      return {
        owner: match[1],
        repo: match[2],
      };
    }
  } catch (error) {
    // Git might not be initialized or origin might not exist
  }
  return null;
}

export async function fetchPRs(
  owner: string,
  repo: string,
): Promise<PullRequest[]> {
  const config = loadConfig();
  const token = config.GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";

  if (!token) {
    throw new Error(
      "GitHub Token not found. Please set GITHUB_TOKEN in your .env or via settings.",
    );
  }

  const client = new GitHubClient(token);
  return client.fetchPRs(owner, repo);
}
