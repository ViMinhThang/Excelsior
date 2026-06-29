import { Compass } from "lucide-react";
import type { AgentMode } from "@excelsior/core";
import { FloatingComposer } from "./FloatingComposer.js";

export function EmptyChat({
  workspaceName,
  inputValue,
  isLoading,
  mode,
  onCancel,
  onInputChange,
  onModeChange,
  onSend,
}: {
  workspaceName: string;
  inputValue: string;
  isLoading: boolean;
  mode: AgentMode;
  onCancel: () => void;
  onInputChange: (value: string) => void;
  onModeChange: (mode: AgentMode) => void;
  onSend: () => void;
}) {
  return (
    <div className="w-full max-w-[640px] mx-auto my-6 animate-fade-in-snappy relative px-4">

      <div className="relative z-10">
        <div className="flex items-center gap-4 mb-6">
          <div className="starter-header-icon relative overflow-hidden group">
            <Compass className="h-5 w-5 relative z-10 transition-transform duration-500 group-hover:rotate-45" />
            <div className="absolute inset-0 bg-brand-accent/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold tracking-tight text-brand-text-strong font-heading">
              {workspaceName}
            </p>
            <p className="mt-1.5 text-sm font-medium text-brand-text-muted">
              What should we build today? Type a prompt below to start.
            </p>
          </div>
        </div>

        {/* Centered Composer when no history */}
        <div className="my-6">
          <FloatingComposer
            inputValue={inputValue}
            isLoading={isLoading}
            mode={mode}
            onCancel={onCancel}
            onInputChange={onInputChange}
            onModeChange={onModeChange}
            onSend={onSend}
          />
        </div>
      </div>
    </div>
  );
}
