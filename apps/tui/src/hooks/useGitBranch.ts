import { execFile } from "node:child_process";
import { useEffect, useState } from "react";

export function useGitBranch(rootPath: string | undefined): string | null {
  const [branchName, setBranchName] = useState<string | null>(null);

  useEffect(() => {
    if (!rootPath) {
      setBranchName(null);
      return;
    }

    let cancelled = false;
    execFile("git", ["branch", "--show-current"], { cwd: rootPath }, (error, stdout) => {
      if (cancelled) return;
      if (error) {
        setBranchName(null);
        return;
      }

      const nextBranchName = stdout.trim();
      setBranchName(nextBranchName || null);
    });

    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  return branchName;
}
