import { execSync } from "node:child_process";

export interface RepoInfo {
  owner: string;
  repo: string;
}

/**
 * Detects the GitHub owner and repository name from the local git configuration.
 */
export function getRepoInfo(): RepoInfo | null {
  try {
    const remoteUrl = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
    
    // Support formats:
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    const match = remoteUrl.match(/github\.com[/:]([^/]+)\/([^.]+)(\.git)?/);
    
    if (match) {
      return {
        owner: match[1],
        repo: match[2],
      };
    }
  } catch (error) {
    // Git might not be initialized or origin might not exist
  }
  
  return null;
}
