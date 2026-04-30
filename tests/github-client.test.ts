import assert from "node:assert/strict";
import test from "node:test";

import { parseGitHubRemoteUrl } from "../src/core/github-client.js";

test("parseGitHubRemoteUrl handles https remotes", () => {
  assert.deepEqual(parseGitHubRemoteUrl("https://github.com/acme/review-tool.git"), {
    owner: "acme",
    repo: "review-tool",
  });
});

test("parseGitHubRemoteUrl handles ssh remotes and repo names with dots", () => {
  assert.deepEqual(parseGitHubRemoteUrl("git@github.com:acme/review.tool.git"), {
    owner: "acme",
    repo: "review.tool",
  });
});

test("parseGitHubRemoteUrl rejects non-github remotes", () => {
  assert.equal(parseGitHubRemoteUrl("https://example.com/acme/review-tool.git"), null);
});
