import React, { useState } from "react";
import { CopyIcon, CheckIcon } from "./Icons";

interface CodeBlockProps {
  language?: string;
  code: string;
}

export default function CodeBlock({ language = "text", code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  // Clean, theme-aware syntax tokenization
  const highlightSyntax = (content: string, lang: string) => {
    const lines = content.split("\n");
    return lines.map((line, lineIdx) => {
      // Comments
      if (line.trim().startsWith("#") || line.trim().startsWith("//")) {
        return (
          <div key={lineIdx} className="text-[var(--text-dim)] italic">
            {line}
          </div>
        );
      }

      // YAML / Config key-value
      if (lang === "yaml" || lang === "dockerfile" || lang === "env") {
        const colonMatch = line.match(/^(\s*)([\w.-]+)(\s*:\s*)(.*)$/);
        if (colonMatch) {
          const [, indent, key, colon, rest] = colonMatch;
          return (
            <div key={lineIdx}>
              <span>{indent}</span>
              <span className="text-[var(--accent)] font-medium">{key}</span>
              <span className="text-[var(--text-dim)]">{colon}</span>
              <span className="text-[#10b981] dark:text-[#98c379]">{rest}</span>
            </div>
          );
        }

        const envMatch = line.match(/^(\s*)([A-Z0-9_]+)(=)(.*)$/);
        if (envMatch) {
          const [, indent, key, eq, val] = envMatch;
          return (
            <div key={lineIdx}>
              <span>{indent}</span>
              <span className="text-[var(--accent)] font-medium">{key}</span>
              <span className="text-[var(--text-dim)]">{eq}</span>
              <span className="text-[#10b981] dark:text-[#98c379]">{val}</span>
            </div>
          );
        }
      }

      // Commands
      if (lang === "powershell" || lang === "bash" || lang === "sh" || lang === "shell") {
        const parts = line.split(" ");
        return (
          <div key={lineIdx}>
            {parts.map((word, wordIdx) => {
              const isCommand = wordIdx === 0 && /^[a-zA-Z0-9_-]+$/.test(word);
              const isFlag = word.startsWith("-");
              const isString = word.startsWith('"') || word.startsWith("'");

              let cls = "text-[var(--text-main)]";
              if (isCommand) cls = "text-[var(--accent)] font-semibold";
              else if (isFlag) cls = "text-[#ea9d34] dark:text-[#d19a66]";
              else if (isString) cls = "text-[#10b981] dark:text-[#98c379]";

              return (
                <span key={wordIdx} className={cls}>
                  {word}
                  {wordIdx < parts.length - 1 ? " " : ""}
                </span>
              );
            })}
          </div>
        );
      }

      return (
        <div key={lineIdx} className="text-[var(--text-main)]">
          {line || "\u00A0"}
        </div>
      );
    });
  };

  return (
    <div className="my-3 rounded-2xl bg-[var(--code-bg)] overflow-hidden shadow-xs font-mono text-[12.5px] transition-colors">
      {/* Header bar */}

      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[var(--code-header)] text-[11.5px] text-[var(--text-dim)]">
        <span className="font-sans font-medium lowercase tracking-wide text-[var(--text-muted)]">
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[var(--text-dim)] hover:text-[var(--text-main)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-card-hover)] transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <CheckIcon className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[11px] text-emerald-500 font-sans">Copied</span>
            </>
          ) : (
            <>
              <CopyIcon className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>

      {/* Code contents */}
      <div className="p-3.5 bg-[var(--code-bg)] overflow-x-auto leading-relaxed selectable-text">
        {highlightSyntax(code, language.toLowerCase())}
      </div>
    </div>
  );
}
