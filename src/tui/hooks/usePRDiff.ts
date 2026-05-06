import { useState, useCallback } from "react";
import { getOctokit, getRepoInfo } from "../../utils/octokit.js";

export function usePRDiff() {
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiff = useCallback(async (prNumber: number) => {
    setLoading(true);
    setError(null);
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
      setDiff(response.data as unknown as string);
    } catch (err: any) {
      setError(err.message || "Failed to fetch diff");
    } finally {
      setLoading(false);
    }
  }, []);

  return { diff, loading, error, fetchDiff };
}
