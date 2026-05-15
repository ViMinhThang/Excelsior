import { getOctokit, getRepoInfo } from "./octokit.js";

export async function fetchPRDiff(prNumber: number): Promise<string> {
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
  return response.data as unknown as string;
}
