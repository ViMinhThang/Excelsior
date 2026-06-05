import { GitBranch, NotebookText, Pin } from "lucide-react";
import type { WorkspaceEnvironmentInfo } from "../../main/preload.js";
import type { DesktopContextSnippet } from "./contextRail/contextRailModel.js";

type ContextRailProps = {
  environment: WorkspaceEnvironmentInfo | null;
  notes: string;
  pinnedSnippetIds: readonly string[];
  snippets: readonly DesktopContextSnippet[];
  workspaceName: string;
  onNotesChange: (notes: string) => void;
  onToggleSnippet: (snippetId: string) => void;
};

export function ContextRail({
  environment,
  notes,
  pinnedSnippetIds,
  snippets,
  workspaceName,
  onNotesChange,
  onToggleSnippet,
}: ContextRailProps) {
  const pinned = new Set(pinnedSnippetIds);
  const branchLabel = environment?.hasGit
    ? environment.branchName ?? "detached"
    : "No git";
  const changeLabel = environment?.changeCount === null || environment?.changeCount === undefined
    ? "Unknown"
    : environment.changeCount === 0
      ? "Clean"
      : `Local ${environment.changeCount}`;

  return (
    <aside className="pointer-events-auto absolute right-6 top-[38%] z-30 hidden h-[min(460px,calc(100%-48px))] w-[280px] -translate-y-1/2 rounded-2xl border border-brand-border/60 bg-brand-surface/85 shadow-sm backdrop-blur-xl xl:flex xl:flex-col">
      <div className="flex h-full min-h-0 flex-col px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-brand-text-strong">Context</h2>
        </div>

        <div className="context-rail-scroll mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          <section>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-text-muted">
              <GitBranch className="h-3.5 w-3.5" />
              <span>Environment</span>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-brand-text-muted">Workspace</dt>
                <dd className="truncate text-brand-text-strong">{workspaceName}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-text-muted">Changes</dt>
                <dd className="text-brand-text-strong">{changeLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-text-muted">Branch</dt>
                <dd className="truncate font-mono text-[13px] text-brand-text-strong">{branchLabel}</dd>
              </div>
            </dl>
          </section>

          <section className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-text-muted">
                <Pin className="h-3.5 w-3.5" />
                <span>Pinned Messages</span>
              </div>
              {pinned.size > 0 && (
                <span className="text-xs text-brand-text-muted">{pinned.size}</span>
              )}
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {snippets.length === 0 ? (
                <p className="rounded-md border border-brand-border/50 bg-brand-panel/40 px-3 py-2 text-sm text-brand-text-muted">
                  No messages yet
                </p>
              ) : snippets.map((snippet) => (
                <label
                  key={snippet.id}
                  className="group flex cursor-pointer gap-3 rounded-md border border-brand-border/40 bg-brand-panel/30 px-3 py-2 text-sm transition-snappy-colors hover:border-brand-accent/50 hover:bg-brand-panel/60"
                >
                  <input
                    type="checkbox"
                    checked={pinned.has(snippet.id)}
                    onChange={() => onToggleSnippet(snippet.id)}
                    className="mt-1 h-4 w-4 shrink-0 accent-brand-accent"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-brand-text-strong">
                      {snippet.title}
                    </span>
                    <span className="mt-0.5 block overflow-hidden text-xs leading-4 text-brand-text-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                      {snippet.content}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-text-muted">
              <NotebookText className="h-3.5 w-3.5" />
              <span>Notes</span>
            </div>
            <textarea
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Type here"
              className="mt-3 min-h-24 w-full resize-none rounded-md border border-brand-border/60 bg-brand-bg/60 px-3 py-2 text-sm leading-5 text-brand-text-strong outline-none placeholder:text-brand-text-muted/70 focus:border-brand-accent/70 transition-snappy-colors"
            />
          </section>
        </div>
      </div>
    </aside>
  );
}
