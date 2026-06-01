import {
  Bug,
  Compass,
  FileSearch,
  GitPullRequest,
} from "lucide-react";

const STARTER_PROMPTS = [
  {
    icon: FileSearch,
    title: "Trace a feature",
    prompt: "Trace how chat submissions flow through this workspace.",
  },
  {
    icon: GitPullRequest,
    title: "Review changes",
    prompt: "Review the current changes and call out risks.",
  },
  {
    icon: Bug,
    title: "Fix a test",
    prompt: "Find the failing test and fix the bug behind it.",
  },
] as const;

export function EmptyChat({
  workspaceName,
  onPickPrompt,
}: {
  workspaceName: string;
  onPickPrompt: (prompt: string) => void;
}) {
  return (
    <div className="w-full pb-8 animate-fade-in-snappy">
      <div className="flex items-center gap-6 mb-5">
        <div className="starter-header-icon">
          <Compass className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold tracking-tight text-brand-text-strong">
            {workspaceName}
          </p>
          <p className="mt-1 text-sm font-medium text-brand-text-light">What should we work on?</p>
        </div>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {STARTER_PROMPTS.map(({ icon: Icon, prompt, title }) => (
          <button
            key={title}
            type="button"
            onClick={() => onPickPrompt(prompt)}
            className="starter-prompt-card"
          >
            <div className="starter-prompt-icon-wrapper">
              <Icon className="h-5 w-5" />
            </div>
            <span className="starter-prompt-title">
              {title}
            </span>
            <span className="starter-prompt-description">
              {prompt}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
