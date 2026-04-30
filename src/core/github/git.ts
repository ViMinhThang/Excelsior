import { execFileSync } from "node:child_process";
import { RepoInfo } from "./types.js";

export function parseGitHubRemoteUrl(remoteUrl: string): RepoInfo | null {
  const normalized = remoteUrl.trim();

  const httpsMatch = normalized.match(
    /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i,
  );
  if (httpsMatch) {
    const [, owner, repo] = httpsMatch;
    if (!owner || !repo) {
      return null;
    }
    return {
      owner,
      repo,
    };
  }

  const sshMatch = normalized.match(
    /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i,
  );
  if (sshMatch) {
    const [, owner, repo] = sshMatch;
    if (!owner || !repo) {
      return null;
    }
    return {
      owner,
      repo,
    };
  }

  const protocolSshMatch = normalized.match(
    /^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i,
  );
  if (protocolSshMatch) {
    const [, owner, repo] = protocolSshMatch;
    if (!owner || !repo) {
      return null;
    }
    return {
      owner,
      repo,
    };
  }

  return null;
}

export function getRepoInfo(cwd = process.cwd()): RepoInfo | null {
  try {
    const remoteUrl = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd,
      encoding: "utf8",
    }).trim();

    return parseGitHubRemoteUrl(remoteUrl);
  } catch {
    return null;
  }
}
