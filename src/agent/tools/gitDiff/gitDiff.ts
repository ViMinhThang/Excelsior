import { tool } from "ai";
import { getOctokit, getRepoInfo } from "../../../utils/octokit.js";
import { gitDiffSchema } from "./type.js";

export const gitDiffTool = tool({
  description: "Fetch the git diff for a GitHub Pull Request using GitHub API",
  inputSchema: gitDiffSchema,
  execute: async ({ prNumber }: { prNumber: number }) => {
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
      return (response.data as unknown as string) || "No diff available.";
    } catch (error: any) {
      return "Error fetching diff";
    }
  },
});
