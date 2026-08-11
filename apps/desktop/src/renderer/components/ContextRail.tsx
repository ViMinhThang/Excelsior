import { CheckCircle2, Circle, LoaderCircle, NotebookText, Settings2 } from "lucide-react";
import type { ProjectedTask } from "@excelsior/core";
import type { WorkspaceEnvironmentInfo } from "../../shared/bridge.js";

type ContextRailProps = {
  environment: WorkspaceEnvironmentInfo | null;
  notes: string;
  tasks: readonly ProjectedTask[];
  workspaceName: string;
  onNotesChange: (notes: string) => void;
};

export function ContextRail({
  environment,
  notes,
  tasks,
  workspaceName,
  onNotesChange,
}: ContextRailProps) {
  const completedTasks = tasks.filter((task) => task.status === "done").length;
  const branchLabel = environment?.hasGit
    ? environment.branchName ?? "detached"
    : "No git";
  const changeLabel = environment?.changeCount === null || environment?.changeCount === undefined
    ? "Unknown"
    : environment.changeCount === 0
      ? "Clean"
      : `Local ${environment.changeCount}`;

  return (
    <aside className="context-rail-panel pointer-events-auto absolute right-4 top-14 z-30 hidden max-h-[calc(100%-88px)] w-[300px] xl:flex xl:flex-col">
      <div className="context-rail-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <section className="context-rail-section">
          <div className="context-rail-section-heading">
            <span>Environment</span>
            <Settings2 className="h-3.5 w-3.5" />
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="context-rail-meta-row">
              <dt>Workspace</dt>
              <dd>{workspaceName}</dd>
            </div>
            <div className="context-rail-meta-row">
              <dt>Changes</dt>
              <dd>{changeLabel}</dd>
            </div>
            <div className="context-rail-meta-row">
              <dt>Branch</dt>
              <dd className="font-mono text-[12px]">{branchLabel}</dd>
            </div>
          </dl>
        </section>

        <div className="context-rail-divider" />

        <section className="context-rail-section">
          <div className="context-rail-section-heading">
            <span>Tasks</span>
            {tasks.length > 0 && <span>{completedTasks}/{tasks.length}</span>}
          </div>

          <div className="mt-3 flex flex-col gap-1">
            {tasks.length === 0 ? (
              <p className="context-rail-empty">No active tasks</p>
            ) : tasks.map((task) => (
              <div
                key={task.id}
                className="context-rail-row"
              >
                <TaskStatusIcon status={task.status} />
                <span
                  className={`min-w-0 flex-1 text-sm leading-5 ${
                    task.status === "done"
                      ? "text-brand-text-muted line-through decoration-brand-text-muted/60"
                      : "text-brand-text-light"
                  }`}
                >
                  {task.text}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="context-rail-divider" />

        <section className="context-rail-section">
          <div className="context-rail-section-heading">
            <span>Notes</span>
            <NotebookText className="h-3.5 w-3.5" />
          </div>
          <textarea
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="No notes yet"
            className="context-rail-input mt-3 min-h-20 w-full resize-none border-0 px-3 py-2 text-sm leading-5 text-brand-text-strong outline-none placeholder:text-brand-text-muted/70"
          />
        </section>
      </div>
    </aside>
  );
}

function TaskStatusIcon({ status }: { status: ProjectedTask["status"] }) {
  if (status === "done") {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-accent" />;
  }

  if (status === "in-progress") {
    return <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand-accent" />;
  }

  return <Circle className="mt-0.5 h-4 w-4 shrink-0 text-brand-text-muted" />;
}
