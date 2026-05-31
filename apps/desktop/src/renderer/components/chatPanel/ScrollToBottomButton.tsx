import { ArrowDown } from "lucide-react";

type ScrollToBottomButtonProps = {
  hasUnreadMessages: boolean;
  isStreaming: boolean;
  onClick: () => void;
};

export function ScrollToBottomButton({
  hasUnreadMessages,
  isStreaming,
  onClick,
}: ScrollToBottomButtonProps) {
  const badgeLabel = isStreaming ? "Streaming" : hasUnreadMessages ? "New" : null;

  return (
    <div className="relative">
      {badgeLabel && (
        <span className="pointer-events-none absolute -right-3 -top-3 rounded-md border border-brand-border bg-brand-surface px-1.5 py-0.5 text-[10px] font-semibold text-brand-text-light shadow-lg">
          {badgeLabel}
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-border bg-brand-composer text-brand-text-light shadow-xl backdrop-blur hover:border-brand-accent hover:text-brand-text-strong transition-snappy-colors"
        title="Scroll to bottom"
        aria-label="Scroll to bottom"
      >
        <ArrowDown className="h-4 w-4" />
      </button>
    </div>
  );
}
