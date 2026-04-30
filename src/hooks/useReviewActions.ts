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
    showStatus,
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
      showStatus(
        `Loaded ${pullRequests.length} pull request(s) from ${repoInfo.owner}/${repoInfo.repo}.`,
      );
    } catch (error) {
      showStatus(error instanceof Error ? error.message : String(error), 8000);
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
      showStatus(
        `Review finished for PR #${pullRequestNumber} in ${repoInfo.owner}/${repoInfo.repo}.`,
      );
    } catch (error) {
      showStatus(error instanceof Error ? error.message : String(error), 8000);
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
