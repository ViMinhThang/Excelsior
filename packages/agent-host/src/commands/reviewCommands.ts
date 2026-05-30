import type { CommandResult } from "@excelsior/core";
import { GitHubClient } from "../github/GitHubClient.js";
import type { AgentCommand, AgentCommandApplication, ReviewCommandServices } from "./types.js";

const defaultReviewCommandServices: ReviewCommandServices = new GitHubClient();

export function createReviewCommands(
  services: ReviewCommandServices = defaultReviewCommandServices,
): AgentCommand[] {
  return [
    {
      definition: {
        name: "review",
        category: "review",
        description: "Review a pull request by number (e.g. /review 42)",
        usage: "/review <pr-number>",
      },
      execute: (args, application) => executeReviewCommand(args, application, services),
    },
    {
      definition: {
        name: "review-post",
        category: "review",
        description: 'Post a comment to a PR (e.g. /review-post 42 "Looks good")',
        usage: "/review-post <pr-number> <comment body>",
      },
      execute: (args) => executeReviewPostCommand(args, services),
    },
  ];
}

async function executeReviewCommand(
  args: string[],
  application: AgentCommandApplication,
  services: ReviewCommandServices,
): Promise<CommandResult> {
  const prNumber = Number.parseInt(args[0], 10);
  if (Number.isNaN(prNumber)) {
    return {
      handled: true,
      message:
        "Usage: /review <pr-number>\nAfter review completes, run /review-post <pr-number> to publish the result as a PR comment.",
      clearInput: true,
    };
  }

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
}

async function executeReviewPostCommand(
  args: string[],
  services: ReviewCommandServices,
): Promise<CommandResult> {
  const prNumber = Number.parseInt(args[0], 10);
  if (Number.isNaN(prNumber) || args.length < 2) {
    return {
      handled: true,
      message: "Usage: /review-post <pr-number> <comment body>",
      clearInput: true,
    };
  }

  const body = args.slice(1).join(" ");
  const result = await services.postPRComment(prNumber, body);
  return { handled: true, message: result, clearInput: true };
}
