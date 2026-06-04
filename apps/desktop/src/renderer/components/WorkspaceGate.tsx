import { Compass, FolderOpen } from "lucide-react";

type WorkspaceGateProps = {
  error: string | null;
  isInitializing: boolean;
  onSelectWorkspace: () => void;
};

export function WorkspaceGate({ error, isInitializing, onSelectWorkspace }: WorkspaceGateProps) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-brand-bg text-brand-text-strong select-none">
      <div className="titlebar">
        <span>Excelsior</span>
      </div>

      <main className="flex min-h-0 flex-1 items-center justify-center px-8">
        <section className="flex w-full max-w-[420px] flex-col items-center gap-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-brand-border/60 bg-brand-surface shadow-lg">
            <Compass className="h-7 w-7 text-brand-accent" />
          </div>

          <div>
            <h1 className="text-3xl font-display font-semibold tracking-tight text-brand-text-strong">
              Excelsior
            </h1>
            <p className="mt-2 text-sm text-brand-text-light">
              Choose a workspace to begin.
            </p>
          </div>

          <button
            type="button"
            onClick={onSelectWorkspace}
            disabled={isInitializing}
            className="group flex h-11 w-full items-center justify-center gap-2.5 rounded-xl bg-brand-accent px-4 text-sm font-semibold text-brand-accent-contrast hover:bg-brand-accent-hover disabled:opacity-50 transition-snappy-colors"
          >
            <FolderOpen className="h-4 w-4" />
            {isInitializing ? "Opening..." : "Open Workspace"}
          </button>

          {error && (
            <p className="w-full rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-left text-xs leading-5 text-red-400">
              {error}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
