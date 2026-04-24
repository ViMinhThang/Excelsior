import { execSync } from "child_process";

export interface RepoInfo {
  owner: string;
  repo: string;
}

export function getRepoInfo(): RepoInfo | null {
  try {
    const remoteUrl = execSync("git remote get-url origin", {
      encoding: "utf-8",
    }).trim();

    // Support both HTTPS and SSH formats
    // HTTPS: https://github.com/owner/repo.git
    // SSH: git@github.com:owner/repo.git
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?$/);

    if (match) {
      return {
        owner: match[1],
        repo: match[2],
      };
    }
  } catch (error) {
    // Not a git repo or no origin remote
  }

  return null;
}
