import { useState, useCallback } from "react";
import { execPromise } from "../../utils/execPromise.js";
import { getOctokit, getRepoInfo } from "../../utils/octokit.js";
import { PullRequest } from "../../types.js";

export function usePullRequests(onPRs: (prs: PullRequest[]) => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPRs = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      setError(err.message || "Failed to fetch PRs");
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, fetchPRs };
}
