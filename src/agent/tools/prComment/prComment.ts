import { tool } from "ai";
import { postPRComment } from "../../../utils/ghComment.js";
import { prCommentSchema } from "./type.js";

export const prCommentTool = tool({
  description: "Post a markdown comment on a GitHub Pull Request using GitHub API",
  inputSchema: prCommentSchema,
  execute: async ({ prNumber, body }: { prNumber: number; body: string }) => {
    return postPRComment(prNumber, body);
  },
});
