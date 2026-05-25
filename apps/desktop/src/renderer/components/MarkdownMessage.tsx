import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { ProjectedBlock } from "@excelsior/core";

type MarkdownPart =
  | { type: "code"; language: string; content: string }
  | { type: "text"; content: string };

function parseMarkdown(text: string): MarkdownPart[] {
  const parts: MarkdownPart[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const textBefore = text.slice(lastIndex, match.index);
    if (textBefore) {
      parts.push({ type: "text", content: textBefore });
    }
    parts.push({
      type: "code",
      language: match[1] || "plaintext",
      content: match[2].trimEnd(),
    });
    lastIndex = regex.lastIndex;
  }

  const textRemaining = text.slice(lastIndex);
  if (textRemaining) {
    parts.push({ type: "text", content: textRemaining });
  }

  return parts;
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const regex = /(\*\*.*?\*\*|`.*?`)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-brand-text-strong">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="px-1.5 py-0.5 rounded border border-brand-border bg-brand-surface font-mono text-[12px] text-brand-accent select-all"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function renderMarkdownLines(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const renderedElements: React.ReactNode[] = [];
  let inList = false;
  let listItems: React.ReactNode[] = [];

  const flushList = (keyPrefix: number) => {
    if (listItems.length > 0) {
      renderedElements.push(
        <ul key={`ul-${keyPrefix}`} className="my-3.5 space-y-2 select-text">
          {listItems}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  lines.forEach((line, index) => {
    const listMatch = line.match(/^[\s]*[-*]\s+(.*)$/);
    if (listMatch) {
      inList = true;
      listItems.push(
        <li
          key={`li-${index}`}
          className="ml-6 list-disc pl-1 text-[13px] leading-6 text-brand-text-light"
        >
          {renderInlineMarkdown(listMatch[1])}
        </li>
      );
      return;
    }

    const numListMatch = line.match(/^[\s]*\d+\.\s+(.*)$/);
    if (numListMatch) {
      inList = true;
      listItems.push(
        <li
          key={`li-${index}`}
          className="ml-6 list-decimal pl-1 text-[13px] leading-6 text-brand-text-light"
        >
          {renderInlineMarkdown(numListMatch[1])}
        </li>
      );
      return;
    }

    if (inList) {
      flushList(index);
    }

    const h3Match = line.match(/^###\s+(.*)$/);
    if (h3Match) {
      renderedElements.push(
        <h3
          key={`h3-${index}`}
          className="text-sm font-semibold text-brand-text-strong mt-4 mb-2 first:mt-1"
        >
          {renderInlineMarkdown(h3Match[1])}
        </h3>
      );
      return;
    }

    const h2Match = line.match(/^##\s+(.*)$/);
    if (h2Match) {
      renderedElements.push(
        <h2
          key={`h2-${index}`}
          className="text-base font-semibold text-brand-text-strong mt-5 mb-2 first:mt-1"
        >
          {renderInlineMarkdown(h2Match[1])}
        </h2>
      );
      return;
    }

    const h1Match = line.match(/^#\s+(.*)$/);
    if (h1Match) {
      renderedElements.push(
        <h1
          key={`h1-${index}`}
          className="text-lg font-semibold text-brand-text-strong mt-6 mb-3 first:mt-1"
        >
          {renderInlineMarkdown(h1Match[1])}
        </h1>
      );
      return;
    }

    const quoteMatch = line.match(/^>\s+(.*)$/);
    if (quoteMatch) {
      renderedElements.push(
        <blockquote
          key={`quote-${index}`}
          className="my-3 border-l-2 border-brand-accent/40 pl-4 py-0.5 italic text-brand-text-muted"
        >
          {renderInlineMarkdown(quoteMatch[1])}
        </blockquote>
      );
      return;
    }

    if (line.trim() === "") {
      renderedElements.push(<div key={`spacer-${index}`} className="h-2" />);
      return;
    }

    renderedElements.push(
      <p
        key={`p-${index}`}
        className="mb-3.5 text-[13.5px] leading-6 text-brand-text-light"
      >
        {renderInlineMarkdown(line)}
      </p>
    );
  });

  if (inList) {
    flushList(lines.length);
  }

  return renderedElements;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code snippet", err);
    }
  };

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-brand-border shadow-md">
      <div className="code-block-header">
        <span className="code-block-lang">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md bg-transparent px-2.5 py-1 text-[11px] font-semibold text-brand-text-muted hover:bg-brand-panel hover:text-brand-text-strong scale-snappy transition-snappy-colors"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="code-block-pre m-0 border-0 rounded-none bg-[var(--codeblock-bg)] p-4 text-[12px] leading-5 font-mono overflow-x-auto text-brand-text-light select-text">
        <code>{code}</code>
      </pre>
    </div>
  );
}

type MarkdownMessageProps = {
  block: Extract<ProjectedBlock, { type: "assistant" }>;
};

export function MarkdownMessage({ block }: MarkdownMessageProps) {
  const parts = parseMarkdown(block.content);

  return (
    <div className="w-full space-y-1 select-text">
      {parts.map((part, index) => {
        if (part.type === "code") {
          return (
            <CodeBlock
              key={index}
              language={part.language}
              code={part.content}
            />
          );
        }
        return (
          <div key={index} className="w-full text-brand-text-light">
            {renderMarkdownLines(part.content)}
          </div>
        );
      })}
    </div>
  );
}
