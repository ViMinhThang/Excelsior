import { execFileSync } from "node:child_process";

import { Octokit } from "octokit";

import { loadConfig, type Config } from "../config.js";

export interface PullRequestData {
  owner: string;
  repo: string;
  pull_number: number;
  title: string;
  body: string;
  diff: string;
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

export class GitHubClient {
  private readonly octokit: Octokit;

  constructor(token?: string) {
    this.octokit = new Octokit(token ? { auth: token } : {});
  }

  async getPullRequest(owner: string, repo: string, pullNumber: number): Promise<PullRequestData> {
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    const { data: diff } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
      mediaType: {
        format: "diff",
      },
    });

    return {
      owner,
      repo,
      pull_number: pullNumber,
      title: pr.title,
      body: pr.body ?? "",
      diff: diff as unknown as string,
    };
  }

  async fetchPRs(owner: string, repo: string): Promise<PullRequest[]> {
    const { data: pullRequests } = await this.octokit.rest.pulls.list({
      owner,
      repo,
      state: "open",
    });

    return pullRequests.map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.user?.login ?? "unknown",
      status: pr.state,
    }));
  }
}

export function resolveGitHubToken(config: Config = loadConfig()): string | undefined {
  return config.GITHUB_TOKEN ?? (process.env.GITHUB_TOKEN?.trim() || undefined);
}

export function parseGitHubRemoteUrl(remoteUrl: string): RepoInfo | null {
  const normalized = remoteUrl.trim();

  const httpsMatch = normalized.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i);
  if (httpsMatch) {
    const [, owner, repo] = httpsMatch;
    if (!owner || !repo) {
      return null;
    }
    return {
      owner,
      repo,
    };
  }

  const sshMatch = normalized.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    const [, owner, repo] = sshMatch;
    if (!owner || !repo) {
      return null;
    }
    return {
      owner,
      repo,
    };
  }

  const protocolSshMatch = normalized.match(/^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i);
  if (protocolSshMatch) {
    const [, owner, repo] = protocolSshMatch;
    if (!owner || !repo) {
      return null;
    }
    return {
      owner,
      repo,
    };
  }

  return null;
}

export function getRepoInfo(cwd = process.cwd()): RepoInfo | null {
  try {
    const remoteUrl = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd,
      encoding: "utf8",
    }).trim();

    return parseGitHubRemoteUrl(remoteUrl);
  } catch {
    return null;
  }
}

export async function fetchPRs(
  owner: string,
  repo: string,
  config: Config = loadConfig(),
): Promise<PullRequest[]> {
  const client = new GitHubClient(resolveGitHubToken(config));
  return client.fetchPRs(owner, repo);
}
