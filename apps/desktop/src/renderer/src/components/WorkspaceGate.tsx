import { Cpu, FolderOpen } from "lucide-react";

type WorkspaceGateProps = {
  error: string | null;
  isInitializing: boolean;
  onSelectWorkspace: () => void;
};

export function WorkspaceGate({ error, isInitializing, onSelectWorkspace }: WorkspaceGateProps) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-brand-bg text-brand-text-strong select-none">
      <div className="titlebar">
        <span className="font-semibold">Excelsior</span>
      </div>

      <main className="flex min-h-0 flex-1 items-center justify-center px-8">
        <section className="flex w-full max-w-[460px] flex-col items-center gap-7 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-brand-border bg-brand-surface">
            <Cpu className="h-6 w-6 text-brand-accent" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Excelsior</h1>
            <p className="text-sm text-brand-text-muted">Choose a workspace to begin.</p>
          </div>

          <button
            type="button"
            onClick={onSelectWorkspace}
            disabled={isInitializing}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-accent px-4 text-sm font-semibold text-brand-accent-contrast disabled:opacity-50"
          >
            <FolderOpen className="h-4 w-4" />
            {isInitializing ? "Opening..." : "Open Workspace"}
          </button>

          {error && (
            <p className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-left text-xs leading-5 text-red-200">
              {error}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
