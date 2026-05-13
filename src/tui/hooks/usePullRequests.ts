import { useState, useCallback } from "react";
import { execPromise } from "../../utils/execPromise.js";
import { getOctokit, getRepoInfo } from "../../utils/octokit.js";
import { PullRequest } from "../../types.js";

export function usePullRequests(
  onPRs: (prs: PullRequest[]) => void,
  onDiff: (diff: string | null) => void,
) {
  const [prsLoading, setPrsLoading] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [prsError, setPrsError] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);

  const fetchPRs = useCallback(async () => {
    setPrsLoading(true);
    setPrsError(null);
    try {
      const { stdout: branch } = await execPromise("git branch --show-current");
      const baseBranch = branch.trim();
      const octokit = await getOctokit();
      const { owner, repo } = await getRepoInfo();
      const { data } = await octokit.pulls.list({
        owner,
        repo,
        base: baseBranch,
        state: "open",
        per_page: 100,
      });
      const parsed: PullRequest[] = data.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        author: pr.user?.login ?? "unknown",
        headRefName: pr.head.ref,
        createdAt: pr.created_at,
      }));
      onPRs(parsed);
    } catch (err: any) {
      setPrsError(err.message || "Failed to fetch PRs");
    } finally {
      setPrsLoading(false);
    }
  }, [onPRs]);

  const fetchDiff = useCallback(async (prNumber: number) => {
    setDiffLoading(true);
    setDiffError(null);
    try {
      const octokit = await getOctokit();
      const { owner, repo } = await getRepoInfo();
      const response = await octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}",
        {
          owner,
          repo,
          pull_number: prNumber,
          mediaType: { format: "diff" },
        },
      );
      onDiff(response.data as unknown as string);
    } catch (err: any) {
      setDiffError(err.message || "Failed to fetch diff");
    } finally {
      setDiffLoading(false);
    }
  }, [onDiff]);

  return {
    prsLoading,
    prsError,
    fetchPRs,
    diffLoading,
    diffError,
    fetchDiff,
  };
}
