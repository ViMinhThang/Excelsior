import { getOctokit, getRepoInfo } from "./octokit.js";

export async function postPRComment(prNumber: number, body: string): Promise<string> {
  try {
    const octokit = await getOctokit();
    const { owner, repo } = await getRepoInfo();
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
    return "Comment posted successfully.";
  } catch (error: unknown) {
    return `Error posting comment: ${error instanceof Error ? error.message : String(error)}`;
  }
}
