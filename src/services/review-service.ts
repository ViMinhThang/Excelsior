import { loadConfig, type Config } from "../infra/config.js";
import { GitHubClient, resolveGitHubToken } from "../core/github/client.js";
import { getRepoInfo } from "../core/github/git.js";
import type { PullRequest, RepoInfo } from "../core/github/types.js";
import { createRuntimeContext, type RuntimeContext } from "../core/runtime.js";
import type { MemoryManager } from "../mem/memory-manager.js";
import type { ReviewMode, ReviewReport } from "../core/agents/review/types.js";
import { reviewAgent } from "../core/agents/review/review-agent.js";
import {
  extractChangedFiles,
  collectWorkspaceContexts,
} from "../core/agents/review/diff.js";
import {
  formatChangedFiles,
  formatFileContexts,
} from "../core/agents/review/review-utils.js";
import { renderReviewReport } from "../core/agents/review/format.js";

export async function listWorkspacePullRequests(args: {
  cwd: string;
  config?: Config;
}): Promise<{ repoInfo: RepoInfo; pullRequests: PullRequest[] }> {
  const config = args.config ?? loadConfig();
  const repoInfo = getRepoInfo(args.cwd);

  if (!repoInfo) {
    throw new Error(
      "Could not detect a GitHub repository from the current workspace.",
    );
  }

  const client = new GitHubClient(resolveGitHubToken(config));
  const pullRequests = await client.fetchPRs(repoInfo.owner, repoInfo.repo);
  return { repoInfo, pullRequests };
}

export async function reviewWorkspacePullRequest(args: {
  cwd: string;
  pullRequestNumber: number;
  mode: ReviewMode;
  memory: MemoryManager;
  config?: Config;
  runtime?: RuntimeContext;
}): Promise<{ repoInfo: RepoInfo; report: ReviewReport }> {
  const config = args.config ?? loadConfig();
  const repoInfo = getRepoInfo(args.cwd);

  if (!repoInfo) {
    throw new Error(
      "Could not detect a GitHub repository from the current workspace.",
    );
  }

  const client = new GitHubClient(resolveGitHubToken(config));
  const pullRequest = await client.getPullRequest(
    repoInfo.owner,
    repoInfo.repo,
    args.pullRequestNumber,
  );
  const runtime =
    args.runtime ??
    createRuntimeContext({
      config,
      workspaceRoot: args.cwd,
      memory: args.memory,
    });

  const changedFiles = extractChangedFiles(pullRequest.diff);
  const fileContexts = await collectWorkspaceContexts(args.cwd, changedFiles);

  const prompt = [
    `Repository: ${repoInfo.owner}/${repoInfo.repo}`,
    `Pull request: ${pullRequest.title}`,
    pullRequest.body
      ? `Description:\n${pullRequest.body}`
      : "Description: (none)",
    "Changed files and patches:",
    formatChangedFiles(changedFiles),
    "Initial file snapshots:",
    formatFileContexts(fileContexts),
  ].join("\n\n");

  runtime.memory.addObservation(
    "Review",
    `Reviewing PR #${args.pullRequestNumber} (${changedFiles.length} changed file(s))`,
  );

  const result = await reviewAgent.run({
    prompt,
    runtime,
    mode: args.mode,
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  const metadata = {
    reviewedAt: new Date().toISOString(),
    changedFiles: changedFiles.length,
    mode: args.mode,
    provider: runtime.provider?.provider ?? "heuristic",
    model: runtime.provider?.model ?? null,
    pullRequestTitle: pullRequest.title,
  } as const;

  const report: ReviewReport = {
    ...result.value,
    metadata,
    rendered: renderReviewReport({
      ...result.value,
      metadata,
    }),
  };

  runtime.memory.addObservation("Review", report.summary);
  return { repoInfo, report };
}
