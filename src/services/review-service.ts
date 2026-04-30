import { loadConfig, type Config } from "../config.js";
import {
  getRepoInfo,
  GitHubClient,
  resolveGitHubToken,
  type PullRequest,
  type RepoInfo,
} from "../core/github-client.js";
import { orchestrateReview } from "../core/orchestrator.js";
import { createRuntimeContext, type RuntimeContext } from "../core/runtime.js";
import type { ReviewMode, ReviewReport } from "../review/types.js";

export async function listWorkspacePullRequests(args: {
  cwd: string;
  config?: Config;
}): Promise<{ repoInfo: RepoInfo; pullRequests: PullRequest[] }> {
  const config = args.config ?? loadConfig();
  const repoInfo = getRepoInfo(args.cwd);

  if (!repoInfo) {
    throw new Error("Could not detect a GitHub repository from the current workspace.");
  }

  const client = new GitHubClient(resolveGitHubToken(config));
  const pullRequests = await client.fetchPRs(repoInfo.owner, repoInfo.repo);
  return { repoInfo, pullRequests };
}

export async function reviewWorkspacePullRequest(args: {
  cwd: string;
  pullRequestNumber: number;
  mode: ReviewMode;
  config?: Config;
  runtime?: RuntimeContext;
}): Promise<{ repoInfo: RepoInfo; report: ReviewReport }> {
  const config = args.config ?? loadConfig();
  const repoInfo = getRepoInfo(args.cwd);

  if (!repoInfo) {
    throw new Error("Could not detect a GitHub repository from the current workspace.");
  }

  const client = new GitHubClient(resolveGitHubToken(config));
  const pullRequest = await client.getPullRequest(repoInfo.owner, repoInfo.repo, args.pullRequestNumber);
  const runtime = args.runtime ?? createRuntimeContext({
    config,
    workspaceRoot: args.cwd,
  });
  const report = await orchestrateReview({
    workspaceRoot: args.cwd,
    repository: `${repoInfo.owner}/${repoInfo.repo}`,
    pullRequestNumber: pullRequest.pull_number,
    pullRequestTitle: pullRequest.title,
    pullRequestBody: pullRequest.body,
    diff: pullRequest.diff,
    mode: args.mode,
  }, runtime);

  return { repoInfo, report };
}
