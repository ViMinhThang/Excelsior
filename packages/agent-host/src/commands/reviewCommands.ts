import { GitHubClient } from "../github/GitHubClient.js";
import type { AgentCommand, AgentCommandApplication, ReviewCommandServices } from "./types.js";
import { CommandBuilder } from "./commandBuilder.js";

const defaultReviewCommandServices: ReviewCommandServices = new GitHubClient();

export function createReviewCommands(
  services: ReviewCommandServices = defaultReviewCommandServices,
): AgentCommand[] {
  return [
    new CommandBuilder<AgentCommandApplication>("review")
      .category("review")
      .description("Review a pull request by number (e.g. /review 42)")
      .signature("<prNumber:number>")
      .default(async ({ prNumber }, application) => {
        try {
          const diff = await services.fetchPRDiff(prNumber);
          application.send(
            `### NEW CODE REVIEW: PR #${prNumber} ###\n\n` +
              `IMPORTANT: This is a fresh review request for PR #${prNumber}. ` +
              `Please ignore any previous PR reviews or sub-agent findings in the chat history. ` +
              `Perform a comprehensive code review of the diff provided below. ` +
              `Spawn specialist sub-agents for different analysis categories ` +
              `(bug hunting, security, code style, infrastructure, readability) ` +
              `and synthesize their findings into a single final report. ` +
              `IMPORTANT: Do not checkout other branches or modify the local git repository. ` +
              `Avoid spawning multiple sub-agents for the same category.\n\n` +
              `\`\`\`diff\n${diff}\n\`\`\``,
            { displayContent: `Reviewing PR #${prNumber}` },
          );
          return {
            handled: true,
            message: `Running code review on PR #${prNumber}...`,
            clearInput: true,
          };
        } catch (err: unknown) {
          return {
            handled: true,
            message: `Error fetching PR #${prNumber}: ${
              err instanceof Error ? err.message : String(err)
            }`,
            clearInput: true,
          };
        }
      })
      .build(),

    new CommandBuilder<void>("review-post") // Not using app context
      .category("review")
      .description('Post a comment to a PR (e.g. /review-post 42 "Looks good")')
      .signature("<prNumber:number> <commentBody...>")
      .default(async ({ prNumber, commentBody }) => {
        const result = await services.postPRComment(prNumber, commentBody);
        return { handled: true, message: result, clearInput: true };
      })
      .build() as unknown as AgentCommand, // Coerce as we don't strictly need the application param for this one
  ];
}
