import type { AppFeature } from "../featureTypes.js";
import { fetchPRDiff } from "../../lib/github/github.js";

export const reviewFeature: AppFeature = {
  id: "review",
  commands: [
    {
      name: "review",
      description: "Review a pull request by number (e.g. /review 42)",
      usage: "/review <pr-number>",
      execute: async (args, context) => {
        const prNumber = parseInt(args[0], 10);
        if (isNaN(prNumber)) {
          context.appendMessage(
            "system",
            "Usage: /review <pr-number>\nAfter review completes, run /review-post <pr-number> to publish the result as a PR comment.",
          );
          return;
        }

        context.appendMessage("system", `Fetching PR #${prNumber} diff...`);

        try {
          const diff = await fetchPRDiff(prNumber);
          context.appendMessage(
            "system",
            `Running code review on PR #${prNumber}...`,
          );
          context.send(
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
            { displayContent: `● Reviewing PR #${prNumber}` },
          );
        } catch (err: unknown) {
          context.appendMessage(
            "system",
            `Error fetching PR #${prNumber}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      },
    },
    {
      name: "review-post",
      description: 'Post a comment to a PR (e.g. /review-post 42 "Looks good")',
      usage: "/review-post <pr-number> <comment body>",
      execute: async (args, context) => {
        const prNumber = parseInt(args[0], 10);
        if (isNaN(prNumber) || args.length < 2) {
          context.appendMessage(
            "system",
            "Usage: /review-post <pr-number> <comment body>",
          );
          return;
        }

        const body = args.slice(1).join(" ");
        context.appendMessage(
          "system",
          `Posting comment to PR #${prNumber}...`,
        );
        const result = await context.postComment(prNumber, body);
        context.appendMessage("system", result);
      },
    },
  ],
};
