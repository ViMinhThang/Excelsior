import React, { useCallback, useMemo, useState } from "react";
import CodeBlock from "./CodeBlock";
import { CheckIcon, CopyIcon } from "./Icons";

type Role = "user" | "assistant" | "system" | "tool" | "reason" | "error";

type MarkdownRendererProps = {
  content?: string;
  role: Role;
  meta?: string;
  isStreaming?: boolean;
};

function inlineParams(raw?: string): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed as Record<string, unknown>)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join("  ");
    }
  } catch {
    // fall through
  }
  return raw.replace(/\r?\n/g, " ").trim();
}

const Inline = React.memo(function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={index} className="px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[var(--accent)] font-mono text-[12px]">
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={index} className="font-semibold text-[var(--text-main)]">
              {part.slice(2, -2)}
            </strong>
          );
        }
        const match = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (match) {
          return (
            <a key={index} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
              {match[1]}
            </a>
          );
        }
        if (part.startsWith("http")) {
          return (
            <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
              {part}
            </a>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
});

const Table = React.memo(function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="my-3 overflow-x-auto rounded-2xl bg-[var(--bg-input)]/40 p-1">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="bg-[var(--bg-input)] font-semibold">
            {headers.map((header, i) => (
              <th key={i} className="px-3.5 py-2.5 text-[12px] uppercase tracking-wider">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--bg-canvas)]/30">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-[var(--bg-card-hover)]/70">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3.5 py-2.5 text-[13px] text-[var(--text-main)]">
                  <Inline text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

function parseTable(lines: string[], startIndex: number): { headers: string[]; rows: string[][]; next: number } | null {
  if (startIndex + 1 >= lines.length) return null;
  const header = lines[startIndex].trim();
  const divider = lines[startIndex + 1].trim();
  if (!header.includes("|") || !divider.includes("|") || !divider.includes("-")) return null;

  const divParts = divider.split("|").map((s) => s.trim()).filter(Boolean);
  if (!divParts.every((p) => /^:?-+:?$/.test(p))) return null;

  const rawHeaders = header.split("|").map((s) => s.trim());
  const hasPipes = header.trim().startsWith("|") && header.trim().endsWith("|");
  const headers = hasPipes ? rawHeaders.filter(Boolean) : rawHeaders.map((s) => s.trim()).filter(Boolean);
  if (headers.length === 0) return null;

  const rows: string[][] = [];
  let current = startIndex + 2;
  while (current < lines.length && lines[current].trim().includes("|") && lines[current].trim()) {
    const cells = lines[current].split("|").map((s) => s.trim());
    const withoutLead = lines[current].trim().startsWith("|") ? cells.slice(1) : cells;
    const cleaned = lines[current].trim().endsWith("|") ? withoutLead.slice(0, -1) : withoutLead;
    rows.push(cleaned);
    current += 1;
  }
  return { headers, rows, next: current };
}

type ContentChunk = { type: "code"; content: string; lang?: string } | { type: "text"; content: string };

function useMarkdownChunks(text: string): ContentChunk[] {
  return useMemo(() => {
    const chunks: ContentChunk[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      const start = remaining.indexOf("```");
      if (start === -1) {
        chunks.push({ type: "text", content: remaining });
        break;
      }
      if (start > 0) chunks.push({ type: "text", content: remaining.slice(0, start) });
      const after = remaining.slice(start + 3);
      const end = after.indexOf("```");
      if (end === -1) {
        const newline = after.indexOf("\n");
        chunks.push({
          type: "code",
          content: newline > -1 ? after.slice(newline + 1) : after,
          lang: newline > -1 ? after.slice(0, newline).trim() : "",
        });
        break;
      }
      const block = after.slice(0, end);
      const newline = block.indexOf("\n");
      chunks.push({
        type: "code",
        content: newline > -1 ? block.slice(newline + 1) : block,
        lang: newline > -1 ? block.slice(0, newline).trim() : "",
      });
      remaining = after.slice(end + 3);
    }
    return chunks;
  }, [text]);
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end my-4">
      <div className="max-w-[85%] px-4 py-2.5 rounded-2xl bg-[var(--bubble-user)] text-[13.5px] leading-relaxed selectable-text whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

function inferToolLanguage(content: string, meta?: string): string {
  const lowerMeta = (meta || "").toLowerCase();
  // Try to extract file extension from content summary like "Wrote ... to path/file.tsx" or from first lines
  const extMatch = content.match(/\.([a-z0-9]{1,5})\b/m);
  if (extMatch) {
    const ext = extMatch[1].toLowerCase();
    const map: Record<string, string> = {
      tsx: "tsx",
      ts: "typescript",
      js: "javascript",
      jsx: "jsx",
      py: "python",
      go: "go",
      rs: "rust",
      json: "json",
      md: "markdown",
      css: "css",
      html: "html",
      yaml: "yaml",
      yml: "yaml",
      sh: "bash",
      bash: "bash",
      sql: "sql",
    };
    if (map[ext]) return map[ext];
    return ext;
  }
  if (lowerMeta.includes("bash") || lowerMeta.includes("shell")) return "bash";
  // fallback: let CodeBlock auto-detect
  return "";
}

function ToolBlock({ content, meta }: { content: string; meta?: string }) {
  const isLong = content.includes("\n") && content.trim().length > 80;
  const hasFence = content.includes("```");
  const fallbackLang = useMemo(() => inferToolLanguage(content, meta), [content, meta]);

  // Parse fenced blocks for rich rendering (reuse same logic as useMarkdownChunks)
  const toolChunks = useMemo(() => {
    if (!hasFence) return null;
    const chunks: { type: "code" | "text"; content: string; lang?: string }[] = [];
    let remaining = content;
    while (remaining.length > 0) {
      const start = remaining.indexOf("```");
      if (start === -1) {
        chunks.push({ type: "text", content: remaining });
        break;
      }
      if (start > 0) chunks.push({ type: "text", content: remaining.slice(0, start) });
      const after = remaining.slice(start + 3);
      const end = after.indexOf("```");
      if (end === -1) {
        const nl = after.indexOf("\n");
        chunks.push({
          type: "code",
          content: nl > -1 ? after.slice(nl + 1) : after,
          lang: nl > -1 ? after.slice(0, nl).trim() : fallbackLang,
        });
        break;
      }
      const block = after.slice(0, end);
      const nl = block.indexOf("\n");
      chunks.push({
        type: "code",
        content: nl > -1 ? block.slice(nl + 1) : block,
        lang: nl > -1 ? block.slice(0, nl).trim() || fallbackLang : fallbackLang,
      });
      remaining = after.slice(end + 3);
    }
    return chunks;
  }, [content, hasFence, fallbackLang]);

  return (
    <div className="my-1.5 text-xs font-mono">
      <div className="flex gap-2 whitespace-nowrap overflow-x-auto text-[12px]">
        <span className="font-semibold text-[var(--accent)]">{meta || "tool"}</span>
        <span className="text-[var(--text-dim)] truncate">{inlineParams(content)}</span>
      </div>
      {isLong && (
        <details className="mt-1.5">
          <summary className="text-[var(--text-dim)] cursor-pointer text-[11px]">View output</summary>
          <div className="mt-1.5 max-h-80 overflow-y-auto selectable-text">
            {hasFence && toolChunks ? (
              <div className="space-y-2">
                {toolChunks.map((ch, i) =>
                  ch.type === "code" ? (
                    <CodeBlock key={i} language={ch.lang || fallbackLang} code={ch.content} />
                  ) : ch.content.trim() ? (
                    <div key={i} className="bg-[var(--bg-input)] rounded-xl p-3 font-mono text-[11.5px] whitespace-pre-wrap text-[var(--text-main)]">
                      {ch.content.trim()}
                    </div>
                  ) : null
                )}
              </div>
            ) : (
              <CodeBlock language={fallbackLang} code={content} />
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function MarkdownRenderer({ content = "", role, meta, isStreaming }: MarkdownRendererProps) {
  const [copied, setCopied] = useState(false);
  const text = typeof content === "string" ? content : String(content ?? "");
  const chunks = useMarkdownChunks(text);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard errors (e.g., file://)
    }
  }, [text]);

  if (role === "user") return <UserBubble text={text} />;
  if (role === "tool") return <ToolBlock content={text} meta={meta} />;
  if (role === "reason") return <div className="my-1.5 text-[var(--text-dim)] text-xs font-mono italic selectable-text">{text}</div>;
  if (role === "error") return <div className="my-2.5 px-3.5 py-2.5 rounded-xl bg-[#261215] text-[#f87171] text-xs font-mono">Error: {text}</div>;

  return (
    <div className="my-4 selectable-text group">
      <div className="space-y-1">
        {chunks.map((chunk, index) => {
          if (chunk.type === "code") return <CodeBlock key={index} language={chunk.lang} code={chunk.content} />;

          const lines = chunk.content.split("\n");
          const elements: React.ReactNode[] = [];
          let i = 0;
          while (i < lines.length) {
            const table = parseTable(lines, i);
            if (table) {
              elements.push(<Table key={`t-${index}-${i}`} headers={table.headers} rows={table.rows} />);
              i = table.next;
              continue;
            }
            const line = lines[i] ?? "";
            const trimmed = line.trim();
            if (!trimmed) {
              elements.push(<div key={`s-${i}`} className="h-1.5" />);
              i += 1;
              continue;
            }
            if (trimmed.startsWith("## ")) {
              elements.push(<h2 key={i} className="text-[15px] font-bold mt-4 mb-2"><Inline text={trimmed.slice(3)} /></h2>);
              i += 1;
              continue;
            }
            if (trimmed.startsWith("### ") || /^[0-9]+\.\s/.test(trimmed)) {
              elements.push(<h3 key={i} className="text-[14px] font-semibold mt-3.5 mb-1.5"><Inline text={trimmed.replace(/^###\s+/, "")} /></h3>);
              i += 1;
              continue;
            }
            if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
              elements.push(
                <div key={i} className="flex gap-2 pl-2 text-[13.5px] text-[var(--text-main)]">
                  <span className="text-[var(--text-muted)]">•</span>
                  <span><Inline text={trimmed.slice(2)} /></span>
                </div>
              );
              i += 1;
              continue;
            }
            elements.push(<p key={i} className="text-[13.5px] text-[var(--text-main)] leading-relaxed"><Inline text={line} /></p>);
            i += 1;
          }
          return <div key={index} className="space-y-2">{elements}</div>;
        })}
        {isStreaming && <span className="inline-block w-2 h-4 bg-[var(--accent)] animate-pulse ml-1 align-middle" aria-hidden />}
      </div>

      {!isStreaming && (
        <button
          type="button"
          onClick={handleCopy}
          className="mt-3 p-1 rounded text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] flex items-center gap-1 text-xs opacity-80 group-hover:opacity-100"
        >
          {copied ? (
            <>
              <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />Copied
            </>
          ) : (
            <>
              <CopyIcon className="w-3.5 h-3.5" />Copy
            </>
          )}
        </button>
      )}
    </div>
  );
}

export default React.memo(MarkdownRenderer);
