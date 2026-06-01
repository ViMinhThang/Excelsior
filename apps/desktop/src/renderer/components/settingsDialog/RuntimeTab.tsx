import { Hash, Infinity as InfinityIcon } from "lucide-react";

type RuntimeTabProps = {
  toolLoopUnlimited: boolean;
  toolLoopStepInput: string;
  onToolLoopUnlimitedChange: (enabled: boolean) => void;
  onToolLoopStepInputChange: (value: string) => void;
};

export function RuntimeTab({
  toolLoopUnlimited,
  toolLoopStepInput,
  onToolLoopUnlimitedChange,
  onToolLoopStepInputChange,
}: RuntimeTabProps) {
  return (
    <div className="settings-form space-y-5">
      <div className="settings-field">
        <span className="settings-label">Agent Run Budget</span>
        <div className="theme-toggle-segmented">
          <button
            type="button"
            onClick={() => onToolLoopUnlimitedChange(true)}
            className={`theme-toggle-btn transition-snappy-colors ${toolLoopUnlimited ? "active" : ""}`}
          >
            <InfinityIcon className="w-4 h-4 mr-2" />
            Unlimited
          </button>
          <button
            type="button"
            onClick={() => onToolLoopUnlimitedChange(false)}
            className={`theme-toggle-btn transition-snappy-colors ${!toolLoopUnlimited ? "active" : ""}`}
          >
            <Hash className="w-4 h-4 mr-2" />
            Finite
          </button>
        </div>
      </div>

      <label className="settings-field" htmlFor="agent-tool-loop-steps">
        <span className="settings-label">Tool Loop Steps</span>
        <input
          id="agent-tool-loop-steps"
          type="number"
          min={1}
          step={1}
          value={toolLoopStepInput}
          disabled={toolLoopUnlimited}
          onChange={(event) =>
            onToolLoopStepInputChange(event.target.value.replace(/\D/g, ""))
          }
          className="settings-control transition-snappy-colors"
        />
      </label>
    </div>
  );
}
