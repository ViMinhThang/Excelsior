import { useAppContext } from "../context/AppContext.js";
import {
  listWorkspacePullRequests,
  reviewWorkspacePullRequest,
} from "../services/review-service.js";

export function useReviewActions() {
  const {
    config,
    mode,
    setIsLoading,
    setLoadingMessage,
    setPullRequests,
    setReviewReport,
    setView,
    workspace,
    memory,
  } = useAppContext();

  async function loadPullRequests(): Promise<void> {
    setIsLoading(true);
    setLoadingMessage("Fetching pull requests...");

    try {
      const { repoInfo, pullRequests } = await listWorkspacePullRequests({
        cwd: workspace,
        config,
      });
      setPullRequests(pullRequests);
      setView("PR_LIST");
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function runReview(pullRequestNumber: number): Promise<void> {
    setIsLoading(true);
    setLoadingMessage(`Reviewing PR #${pullRequestNumber}...`);

    try {
      const { repoInfo, report } = await reviewWorkspacePullRequest({
        cwd: workspace,
        pullRequestNumber,
        mode,
        memory,
        config,
      });
      setReviewReport(report);
      setView("MAIN");
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePullRequestSelect(
    pullRequestNumber: number,
  ): Promise<void> {
    setView("MAIN");
    await runReview(pullRequestNumber);
  }

  return { loadPullRequests, runReview, handlePullRequestSelect };
}
