import { useConfig } from "../context/ConfigContext.js";
import { useUI } from "../context/UIContext.js";
import { useReview } from "../context/ReviewContext.js";
import { useAsyncAction } from "./useAsyncAction.js";
import {
  listWorkspacePullRequests,
  reviewWorkspacePullRequest,
} from "../services/review-service.js";

export function useReviewActions() {
  const { config, workspace, memory } = useConfig();
  const { setView } = useUI();
  const { mode, setPullRequests, setReviewReport } = useReview();
  const { run } = useAsyncAction();

  async function loadPullRequests(): Promise<void> {
    await run("Fetching pull requests...", async () => {
      const { pullRequests } = await listWorkspacePullRequests({
        cwd: workspace,
        config,
      });
      setPullRequests(pullRequests);
      setView("PR_LIST");
    });
  }

  async function runReview(pullRequestNumber: number): Promise<void> {
    await run(`Reviewing PR #${pullRequestNumber}...`, async () => {
      const { report } = await reviewWorkspacePullRequest({
        cwd: workspace,
        pullRequestNumber,
        mode,
        memory,
        config,
      });
      setReviewReport(report);
      setView("MAIN");
    });
  }

  async function handlePullRequestSelect(
    pullRequestNumber: number,
  ): Promise<void> {
    setView("MAIN");
    await runReview(pullRequestNumber);
  }

  return { loadPullRequests, runReview, handlePullRequestSelect };
}
