import React, { useCallback, useState } from "react";
import { CheckIcon, CopyIcon } from "./Icons";

type CodeBlockProps = {
  language?: string;
  code: string;
};

function CodeBlock({ language = "text", code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable in file:// context
    }
  }, [code]);

  return (
    <div className="my-3 rounded-2xl bg-[var(--code-bg)] overflow-hidden font-mono text-[12.5px]">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[var(--code-header)] text-[11.5px] text-[var(--text-dim)]">
        <span className="font-sans font-medium lowercase tracking-wide text-[var(--text-muted)]">
          {language}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
          className="flex items-center gap-1 text-[var(--text-dim)] hover:text-[var(--text-main)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-card-hover)]"
        >
          {copied ? (
            <>
              <CheckIcon className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[11px] text-emerald-500 font-sans">Copied</span>
            </>
          ) : (
            <CopyIcon className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto leading-relaxed selectable-text whitespace-pre-wrap text-[var(--text-main)]">
        {code.trim() || " "}
      </pre>
    </div>
  );
}

export default React.memo(CodeBlock);
