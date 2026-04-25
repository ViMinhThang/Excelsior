import { useEffect } from "react";
import { useApp, useInput } from "ink";

import { formatHelpText, parseCommand } from "../app/commands.js";
import { saveConfig } from "../config.js";
import { globalMemory } from "../mem/memory-manager.js";
import type { ReviewMode } from "../review/types.js";
import { listWorkspacePullRequests, reviewWorkspacePullRequest } from "../services/review-service.js";
import { useAppContext } from "../context/AppContext.js";

export function useAppController() {
  const { exit } = useApp();
  const state = useAppContext();
  const {
    config,
    credentialField,
    mode,
    refreshConfig,
    setCommand,
    setCredentialField,
    setCredentialInput,
    setIsLoading,
    setLoadingMessage,
    setMode,
    setPullRequests,
    setReviewReport,
    setView,
    showStatus,
    workspace,
  } = state;

  useEffect(() => {
    setMode(globalMemory.getMode());
    refreshConfig();
  }, [refreshConfig, setMode]);

  useInput((input, key) => {
    if (key.ctrl && input === "s") {
      setView("SETTINGS");
      return;
    }

    if (key.ctrl && input === "p") {
      const nextMode: ReviewMode = mode === "ACT" ? "PLAN" : "ACT";
      setMode(nextMode);
      globalMemory.setMode(nextMode);
      showStatus(`Switched to ${nextMode} mode.`);
      return;
    }

    if (key.ctrl && input === "q") {
      exit();
      return;
    }

    if (key.escape) {
      if (state.view === "CREDENTIAL_INPUT" || state.view === "PROVIDER_SELECT") {
        setView("SETTINGS");
        return;
      }

      if (state.view === "PR_LIST" || state.view === "SETTINGS") {
        setView("MAIN");
      }
    }
  });

  async function handleCommandSubmit(value: string): Promise<void> {
    const parsed = parseCommand(value);

    switch (parsed.type) {
      case "list-prs":
        await loadPullRequests();
        break;
      case "review-pr":
        if (parsed.prNumber !== undefined) {
          await runReview(parsed.prNumber);
        } else {
          await loadPullRequests();
        }
        break;
      case "open-settings":
        setView("SETTINGS");
        break;
      case "show-help":
        showStatus(formatHelpText(), 8000);
        break;
      case "unknown":
        showStatus(`Unknown command: ${parsed.raw}`);
        break;
    }

    setCommand("");
  }

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
      showStatus(`Loaded ${pullRequests.length} pull request(s) from ${repoInfo.owner}/${repoInfo.repo}.`);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : String(error), 8000);
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePullRequestSelect(pullRequestNumber: number): Promise<void> {
    await runReview(pullRequestNumber);
  }

  async function runReview(pullRequestNumber: number): Promise<void> {
    setIsLoading(true);
    setLoadingMessage(`Reviewing PR #${pullRequestNumber}...`);

    try {
      const { repoInfo, report } = await reviewWorkspacePullRequest({
        cwd: workspace,
        pullRequestNumber,
        mode,
        config,
      });
      setReviewReport(report);
      setView("MAIN");
      showStatus(`Review finished for PR #${pullRequestNumber} in ${repoInfo.owner}/${repoInfo.repo}.`);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : String(error), 8000);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSettingsSelect(value: string): void {
    if (value === "provider") {
      setView("PROVIDER_SELECT");
      return;
    }

    if (value === "model") {
      setView("MODEL_SELECT");
      return;
    }

    if (value === "gemini_key") {
      setCredentialField("GEMINI_API_KEY");
      setCredentialInput(config.GEMINI_API_KEY ?? "");
      setView("CREDENTIAL_INPUT");
      return;
    }

    if (value === "anthropic_key") {
      setCredentialField("ANTHROPIC_API_KEY");
      setCredentialInput(config.ANTHROPIC_API_KEY ?? "");
      setView("CREDENTIAL_INPUT");
      return;
    }

    if (value === "github_token") {
      setCredentialField("GITHUB_TOKEN");
      setCredentialInput(config.GITHUB_TOKEN ?? "");
      setView("CREDENTIAL_INPUT");
      return;
    }

    setView("MAIN");
  }

  function handleProviderSelect(provider: "google" | "anthropic" | "back"): void {
    if (provider === "back") {
      setView("SETTINGS");
      return;
    }

    saveConfig({ LLM_PROVIDER: provider });
    refreshConfig();
    showStatus(`Provider set to ${provider}.`);

    if (provider === "google") {
      setCredentialField("GEMINI_API_KEY");
      setCredentialInput(config.GEMINI_API_KEY ?? "");
    } else if (provider === "anthropic") {
      setCredentialField("ANTHROPIC_API_KEY");
      setCredentialInput(config.ANTHROPIC_API_KEY ?? "");
    }

    setView("CREDENTIAL_INPUT");
  }

  function handleModelSelect(value: string): void {
    if (value === "back") {
      setView("SETTINGS");
      return;
    }

    const [provider, ...modelParts] = value.split(":");
    const model = modelParts.join(":");
    const modelField = provider === "google" ? "GEMINI_MODEL" : "ANTHROPIC_MODEL";

    saveConfig({ 
      LLM_PROVIDER: provider as any,
      [modelField]: model 
    });
    refreshConfig();
    showStatus(`Switched to ${provider} / ${model}.`);
    setView("SETTINGS");
  }

  function handleCredentialSubmit(value: string): void {
    if (!credentialField) {
      setView("MAIN");
      return;
    }

    saveConfig({ [credentialField]: value.trim() } as Partial<typeof config>);
    refreshConfig();
    setCredentialInput("");
    setCredentialField(null);
    setView("SETTINGS");
    showStatus("Credential saved.");
  }

  function credentialTitle(): string {
    switch (credentialField) {
      case "GEMINI_API_KEY":
        return "Enter Gemini API Key";
      case "ANTHROPIC_API_KEY":
        return "Enter Anthropic API Key";
      case "GITHUB_TOKEN":
        return "Enter GitHub Token";
      default:
        return "Enter value";
    }
  }

  return {
    ...state,
    credentialTitle: credentialTitle(),
    handleCommandSubmit,
    handleCredentialSubmit,
    handleModelSelect,
    handleProviderSelect,
    handlePullRequestSelect,
    handleSettingsSelect,
  };
}
