import React, { useState } from "react";
import CodeBlock from "./CodeBlock";
import { CopyIcon, CheckIcon, ThumbsUpIcon, ThumbsDownIcon } from "./Icons";

interface MarkdownRendererProps {
  content?: string;
  role: "user" | "assistant" | "system" | "tool" | "reason" | "error";
  meta?: string;
  isStreaming?: boolean;
}

interface TableData {
  headers: string[];
  alignments: ("left" | "center" | "right")[];
  rows: string[][];
}

function formatToolParamsInline(raw?: string): string {
  if (!raw || typeof raw !== "string") return "";
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return Object.entries(parsed)
        .map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v)}`)
        .join("  ");
    }
  } catch {
    // Fallback: trim to single-line representation
  }
  return raw.replace(/\r?\n/g, " ").trim();
}

function parseTable(lines: string[], startIdx: number): { table: TableData; nextIdx: number } | null {
  if (!lines || startIdx + 1 >= lines.length) return null;
  const headerLine = (lines[startIdx] || "").trim();
  const dividerLine = (lines[startIdx + 1] || "").trim();

  // Must contain pipe and hyphen
  if (!headerLine.includes("|") || !dividerLine.includes("|") || !dividerLine.includes("-")) {
    return null;
  }

  const dividerParts = dividerLine
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  const isDivider = dividerParts.length > 0 && dividerParts.every((p) => /^:?-+:?$/.test(p));
  if (!isDivider) return null;

  const headerParts = headerLine
    .split("|")
    .map((s) => s.trim());
  if (headerLine.startsWith("|") && headerParts.length > 0 && headerParts[0] === "") headerParts.shift();
  if (headerLine.endsWith("|") && headerParts.length > 0 && headerParts[headerParts.length - 1] === "") headerParts.pop();

  if (headerParts.length === 0) return null;

  const alignments: ("left" | "center" | "right")[] = dividerParts.map((p) => {
    const startColon = p.startsWith(":");
    const endColon = p.endsWith(":");
    if (startColon && endColon) return "center";
    if (endColon) return "right";
    return "left";
  });

  const rows: string[][] = [];
  let curr = startIdx + 2;
  while (curr < lines.length) {
    const rowLine = (lines[curr] || "").trim();
    if (!rowLine || !rowLine.includes("|")) break;
    const cells = rowLine.split("|").map((s) => s.trim());
    if (rowLine.startsWith("|") && cells.length > 0 && cells[0] === "") cells.shift();
    if (rowLine.endsWith("|") && cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    rows.push(cells);
    curr++;
  }

  return {
    table: {
      headers: headerParts,
      alignments,
      rows
    },
    nextIdx: Math.max(curr, startIdx + 2)
  };
}

export default function MarkdownRenderer({
  content = "",
  role,
  meta,
  isStreaming
}: MarkdownRendererProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const safeContent = typeof content === "string" ? content : content ? String(content) : "";

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(safeContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  if (role === "user") {
    return (
      <div className="flex justify-end my-4">
        <div className="max-w-[85%] px-4 py-2.5 rounded-2xl bg-[var(--bubble-user)] text-[var(--text-main)] text-[13.5px] leading-relaxed shadow-[var(--card-shadow)] selectable-text whitespace-pre-wrap">
          {safeContent}
        </div>
      </div>
    );
  }

  // Tool Call: Consistent accent color + background for output panel
  if (role === "tool") {
    const hasMultiline = safeContent.includes("\n") && safeContent.trim().length > 80;

    return (
      <div className="my-1.5 text-xs">
        {/* Tool Name and Parameters on the SAME LINE */}
        <div className="flex items-center gap-2 font-mono overflow-x-auto text-[12px] whitespace-nowrap scrollbar-none">
          <span className="shrink-0 text-[11.5px] font-semibold text-[var(--accent)]">
            {meta || "tool"}
          </span>
          <span className="text-[var(--text-dim)] font-mono text-[11.5px] truncate">
            {formatToolParamsInline(safeContent)}
          </span>
        </div>

        {/* Detailed multiline output with background container */}
        {hasMultiline && (
          <details className="mt-1.5 text-[11.5px]">
            <summary className="text-[var(--text-dim)] hover:text-[var(--text-muted)] cursor-pointer font-mono select-none text-[11px] inline-flex items-center gap-1">
              <span>View output</span>
            </summary>
            <div className="mt-1.5 bg-[var(--bg-input)] rounded-xl p-3 text-[var(--text-muted)] font-mono text-[11.5px] max-h-64 overflow-y-auto whitespace-pre-wrap selectable-text shadow-inner">
              {safeContent}
            </div>
          </details>
        )}
      </div>
    );
  }

  // Reasoning: No background and no "Thought:" prefix
  if (role === "reason") {
    return (
      <div className="my-1.5 px-0.5 text-[var(--text-dim)] text-xs font-mono italic selectable-text">
        {safeContent}
      </div>
    );
  }

  if (role === "error") {
    return (
      <div className="my-2.5 px-3.5 py-2.5 rounded-xl bg-[#261215] text-[#f87171] text-xs font-mono selectable-text">
        <span className="font-bold mr-1.5">Error:</span>
        {safeContent}
      </div>
    );
  }

  const renderInlineSpans = (raw: string) => {
    if (!raw || typeof raw !== "string") return "";
    const parts = raw.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+)/g);

    return parts.map((part, pIdx) => {
      if (!part) return null;
      if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
        return (
          <code key={pIdx} className="px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[var(--accent)] font-mono text-[12px]">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith("**") && part.endsWith("**") && part.length > 3) {
        return (
          <strong key={pIdx} className="font-semibold text-[var(--text-main)]">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("[") && part.includes("](")) {
        const match = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (match) {
          return (
            <a
              key={pIdx}
              href={match[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline underline-offset-2"
            >
              {match[1]}
            </a>
          );
        }
      }
      if (part.startsWith("http://") || part.startsWith("https://")) {
        return (
          <a
            key={pIdx}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline underline-offset-2"
          >
            {part}
          </a>
        );
      }
      return <span key={pIdx}>{part}</span>;
    });
  };

  const renderTable = (table: TableData, key: string | number) => {
    return (
      <div key={key} className="my-3.5 overflow-x-auto rounded-2xl bg-[var(--bg-input)]/40 p-1 shadow-xs">
        <table className="w-full text-left text-xs border-collapse font-sans">
          <thead>
            <tr className="bg-[var(--bg-input)] text-[var(--text-main)] font-semibold rounded-xl">
              {table.headers.map((h, hIdx) => {
                const align = table.alignments[hIdx] || "left";
                return (
                  <th
                    key={hIdx}
                    className={`px-3.5 py-2.5 font-semibold text-[12px] uppercase tracking-wider first:rounded-l-xl last:rounded-r-xl ${
                      align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {renderInlineSpans(h)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--bg-canvas)]/30">
            {table.rows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className="hover:bg-[var(--bg-card-hover)]/70 transition-colors"
              >
                {row.map((cell, cIdx) => {
                  const align = table.alignments[cIdx] || "left";
                  return (
                    <td
                      key={cIdx}
                      className={`px-3.5 py-2.5 text-[13px] text-[var(--text-muted)] leading-relaxed ${
                        align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      {renderInlineSpans(cell)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderFormattedAssistantContent = (text: string) => {
    if (!text || typeof text !== "string") return null;

    try {
      const chunks: { type: "code" | "text"; content: string; lang?: string }[] = [];
      let remaining = text;

      while (remaining.length > 0) {
        const codeStart = remaining.indexOf("```");
        if (codeStart === -1) {
          chunks.push({ type: "text", content: remaining });
          break;
        }

        if (codeStart > 0) {
          chunks.push({ type: "text", content: remaining.slice(0, codeStart) });
        }

        const afterTicks = remaining.slice(codeStart + 3);
        const codeEnd = afterTicks.indexOf("```");

        if (codeEnd === -1) {
          const lineBreak = afterTicks.indexOf("\n");
          const lang = lineBreak > -1 ? afterTicks.slice(0, lineBreak).trim() : "";
          const code = lineBreak > -1 ? afterTicks.slice(lineBreak + 1) : afterTicks;
          chunks.push({ type: "code", content: code, lang: lang || "text" });
          break;
        } else {
          const fullBlock = afterTicks.slice(0, codeEnd);
          const lineBreak = fullBlock.indexOf("\n");
          const lang = lineBreak > -1 ? fullBlock.slice(0, lineBreak).trim() : "";
          const code = lineBreak > -1 ? fullBlock.slice(lineBreak + 1) : fullBlock;
          chunks.push({ type: "code", content: code, lang: lang || "text" });
          remaining = afterTicks.slice(codeEnd + 3);
        }
      }

      return chunks.map((chunk, index) => {
        if (chunk.type === "code") {
          return <CodeBlock key={index} language={chunk.lang} code={chunk.content} />;
        }

        const lines = chunk.content.split("\n");
        const elements: React.ReactNode[] = [];
        let i = 0;

        while (i < lines.length) {
          // Try parsing markdown table
          const tableResult = parseTable(lines, i);
          if (tableResult) {
            elements.push(renderTable(tableResult.table, `tbl-${index}-${i}`));
            i = tableResult.nextIdx;
            continue;
          }

          const line = lines[i] || "";
          const trimmed = line.trim();

          if (!trimmed) {
            elements.push(<div key={`sp-${i}`} className="h-1.5" />);
            i++;
            continue;
          }

          if (trimmed.startsWith("### ") || /^[0-9]+\.\s/.test(trimmed)) {
            elements.push(
              <h3 key={`h3-${i}`} className="text-[14px] font-semibold text-[var(--text-main)] mt-3.5 mb-1.5">
                {trimmed.replace(/^###\s+/, "")}
              </h3>
            );
            i++;
            continue;
          }

          if (trimmed.startsWith("## ")) {
            elements.push(
              <h2 key={`h2-${i}`} className="text-[15px] font-bold text-[var(--text-main)] mt-4 mb-2">
                {trimmed.replace(/^##\s+/, "")}
              </h2>
            );
            i++;
            continue;
          }

          if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            elements.push(
              <div key={`li-${i}`} className="flex items-start gap-2 pl-2 text-[13.5px] text-[var(--text-muted)] leading-relaxed">
                <span className="text-[var(--text-dim)] mt-1.5">•</span>
                <span>{renderInlineSpans(trimmed.slice(2))}</span>
              </div>
            );
            i++;
            continue;
          }

          elements.push(
            <p key={`p-${i}`} className="text-[13.5px] text-[var(--text-muted)] leading-relaxed">
              {renderInlineSpans(line)}
            </p>
          );
          i++;
        }

        return (
          <div key={index} className="space-y-2">
            {elements}
          </div>
        );
      });
    } catch (e) {
      console.error("Markdown rendering error:", e);
      return <div className="whitespace-pre-wrap text-[13.5px]">{text}</div>;
    }
  };

  return (
    <div className="my-4 text-[var(--text-main)] selectable-text group">
      <div className="space-y-1">
        {renderFormattedAssistantContent(safeContent)}
        {isStreaming && (
          <span className="inline-block w-2 h-4 bg-[var(--accent)] animate-pulse ml-1 align-middle" />
        )}
      </div>

      {!isStreaming && (
        <div className="flex items-center gap-2 mt-3 pt-1 text-[var(--text-dim)] opacity-80 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopyMessage}
            className="p-1 rounded hover:bg-[var(--bg-card)] hover:text-[var(--text-main)] transition-colors"
            title="Copy message"
          >
            {copied ? <CheckIcon className="w-3.5 h-3.5 text-emerald-400" /> : <CopyIcon className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setFeedback(feedback === "up" ? null : "up")}
            className={`p-1 rounded hover:bg-[var(--bg-card)] transition-colors ${
              feedback === "up" ? "text-emerald-400 bg-[#192b20]" : "hover:text-[var(--text-main)]"
            }`}
            title="Good response"
          >
            <ThumbsUpIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setFeedback(feedback === "down" ? null : "down")}
            className={`p-1 rounded hover:bg-[var(--bg-card)] transition-colors ${
              feedback === "down" ? "text-rose-400 bg-[#2d181c]" : "hover:text-[var(--text-main)]"
            }`}
            title="Bad response"
          >
            <ThumbsDownIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
