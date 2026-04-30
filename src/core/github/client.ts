import { Octokit } from "octokit";
import { loadConfig, type Config } from "../../config.js";
import { PullRequest, PullRequestData } from "./types.js";

export class GitHubClient {
  private readonly octokit: Octokit;

  constructor(token?: string) {
    this.octokit = new Octokit(token ? { auth: token } : {});
  }

  async getPullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<PullRequestData> {
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    const { data: diff } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
      headers: {
        accept: "application/vnd.github.v3.diff",
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
    const { data: prs } = await this.octokit.rest.pulls.list({
      owner,
      repo,
      state: "open",
    });

    return prs.map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.user?.login ?? "unknown",
      status: pr.state,
    }));
  }
}

export function resolveGitHubToken(
  config: Config = loadConfig(),
): string | undefined {
  return config.GITHUB_TOKEN ?? (process.env.GITHUB_TOKEN?.trim() || undefined);
}

export async function fetchPRs(
  owner: string,
  repo: string,
  config: Config = loadConfig(),
): Promise<PullRequest[]> {
  const client = new GitHubClient(resolveGitHubToken(config));
  return client.fetchPRs(owner, repo);
}
