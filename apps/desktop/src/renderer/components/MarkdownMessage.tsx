import { useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  parseInlineMarkdown,
  parseMarkdown,
} from "./markdownMessage/markdownModel.js";

function renderInlineMarkdown(text: string): React.ReactNode {
  return parseInlineMarkdown(text).map((part, index) => {
    if (part.type === "strong") {
      return (
        <strong key={index} className="font-semibold text-brand-text-strong">
          {part.content}
        </strong>
      );
    }
    if (part.type === "code") {
      return (
        <code
          key={index}
          className="px-1.5 py-0.5 rounded border border-brand-border bg-brand-surface font-mono text-[12px] text-brand-accent select-all"
        >
          {part.content}
        </code>
      );
    }
    return part.content;
  });
}

function splitPipeRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line: string | undefined): boolean {
  if (!line) return false;
  const cells = splitPipeRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.replace(/\s+/g, "")));
}

function isPipeTableLine(line: string | undefined): boolean {
  if (!line) return false;
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes("|")) return false;
  return splitPipeRow(trimmed).length >= 1;
}

function getAlignment(cell: string): "left" | "center" | "right" {
  const trimmed = cell.trim().replace(/\s+/g, "");
  if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
  if (trimmed.endsWith(":")) return "right";
  return "left";
}

const alignClassMap = {
  left: "text-left",
  center: "text-center",
  right: "text-right"
};

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

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    // Check if this is the start of a table
    if (isPipeTableLine(line) && isTableSeparator(lines[index + 1])) {
      if (inList) {
        flushList(index);
      }

      const headers = splitPipeRow(line);
      const separators = splitPipeRow(lines[index + 1]);
      const alignments = separators.map(getAlignment);

      const rows: string[][] = [];
      let j = index + 2;
      while (j < lines.length && isPipeTableLine(lines[j]) && !isTableSeparator(lines[j])) {
        rows.push(splitPipeRow(lines[j]));
        j++;
      }

      // Advance index to the end of the table
      index = j - 1;

      renderedElements.push(
        <div
          key={`table-${index}`}
          className="my-4 overflow-x-auto rounded-lg border border-brand-border/60 bg-brand-surface/40"
        >
          <table className="min-w-full divide-y divide-brand-border/40 text-[13px]">
            <thead className="bg-brand-surface/80">
              <tr>
                {headers.map((header, hIdx) => {
                  const align = alignments[hIdx] || "left";
                  const alignmentClass = alignClassMap[align];
                  return (
                    <th
                      key={`th-${hIdx}`}
                      className={`px-4 py-2 font-semibold text-brand-text-strong ${alignmentClass}`}
                    >
                      {renderInlineMarkdown(header)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/20">
              {rows.map((row, rIdx) => (
                <tr
                  key={`tr-${rIdx}`}
                  className="hover:bg-brand-surface/30 transition-colors"
                >
                  {headers.map((_, cIdx) => {
                    const cellVal = row[cIdx] || "";
                    const align = alignments[cIdx] || "left";
                    const alignmentClass = alignClassMap[align];
                    return (
                      <td
                        key={`td-${cIdx}`}
                        className={`px-4 py-2 text-brand-text-light ${alignmentClass}`}
                      >
                        {renderInlineMarkdown(cellVal)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

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
      continue;
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
      continue;
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
      continue;
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
      continue;
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
      continue;
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
      continue;
    }

    if (line.trim() === "") {
      renderedElements.push(<div key={`spacer-${index}`} className="h-2" />);
      continue;
    }

    renderedElements.push(
      <p
        key={`p-${index}`}
        className="mb-3.5 text-[13.5px] leading-6 text-brand-text-light"
      >
        {renderInlineMarkdown(line)}
      </p>
    );
  }

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
  block: { content: string };
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
