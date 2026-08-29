import React, { useCallback, useMemo, useState } from "react";
import hljs from "highlight.js/lib/common";
import { CheckIcon, CopyIcon } from "./Icons";

type CodeBlockProps = {
  language?: string;
  code: string;
};

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

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

  const { highlighted, detectedLang } = useMemo(() => {
    const raw = code.trim() || " ";
    const lang = (language || "").trim().toLowerCase();
    // normalize common aliases
    const aliasMap: Record<string, string> = {
      js: "javascript",
      ts: "typescript",
      sh: "bash",
      shell: "bash",
      yml: "yaml",
      md: "markdown",
      py: "python",
      rb: "ruby",
      golang: "go",
    };
    const normalized = aliasMap[lang] || lang;

    if (normalized && normalized !== "text" && hljs.getLanguage(normalized)) {
      try {
        return { highlighted: hljs.highlight(raw, { language: normalized }).value, detectedLang: normalized };
      } catch {
        // fallback to auto
      }
    }
    // For "text" or unknown language, try auto-detection; if content looks like code, highlight, otherwise plain
    if (!normalized || normalized === "text") {
      try {
        const auto = hljs.highlightAuto(raw);
        // Use auto if it detected a language with decent relevance, or if content looks code-ish
        const looksLikeCode = /[{};:=]|(?:function|import|export|const|let|var|class|return|if|for|while)\b/.test(raw);
        if (auto.language && (auto.relevance > 3 || looksLikeCode)) {
          return { highlighted: auto.value, detectedLang: auto.language };
        }
        // fallback to plain escaped
        return { highlighted: escapeHtml(raw), detectedLang: "text" };
      } catch {
        return { highlighted: escapeHtml(raw), detectedLang: "text" };
      }
    }
    try {
      const auto = hljs.highlightAuto(raw);
      if (auto.language && auto.relevance > 5) {
        return { highlighted: auto.value, detectedLang: auto.language };
      }
      return { highlighted: auto.value, detectedLang: auto.language || lang };
    } catch {
      return { highlighted: escapeHtml(raw), detectedLang: lang || "text" };
    }
  }, [code, language]);

  const displayLang = detectedLang || language || "text";

  return (
    <div className="my-3 rounded-2xl bg-[var(--code-bg)] overflow-hidden font-mono text-[12.5px] border border-[var(--border-subtle)]">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[var(--code-header)] text-[11.5px] text-[var(--text-dim)]">
        <span className="font-sans font-medium lowercase tracking-wide text-[var(--text-muted)]">{displayLang}</span>
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
        <code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
}

export default React.memo(CodeBlock);
