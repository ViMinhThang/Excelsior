import React, { useCallback, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import CodeBlock from "./CodeBlock";
import { parseChunks } from "../lib/markdown";

type Role = "user" | "assistant" | "system" | "tool" | "reason" | "error";

type MarkdownRendererProps = {
  content?: string;
  role: Role;
  meta?: string;
  args?: string;
  isStreaming?: boolean;
};

const Inline = React.memo(function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={index} className="px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[var(--text-main)] font-mono text-[12px]">
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

function useMarkdownChunks(text: string) {
  return useMemo(() => parseChunks(text), [text]);
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end my-3">
      <div className="max-w-[85%] px-4 py-2.5 rounded-2xl bg-[var(--bubble-user)] border-subtle shadow-[var(--card-shadow)] text-[13px] leading-relaxed selectable-text whitespace-pre-wrap text-[var(--text-main)]">
        {text}
      </div>
    </div>
  );
}

function ToolBlock({ content, meta, args: rawArgs }: { content: string; meta?: string; args?: string }) {
  const [open, setOpen] = useState(false);
  const isResult = !!meta?.includes("→");
  const rawName = isResult ? meta!.replace(/\s*→$/, "").trim() : (meta || "tool").trim();
  const hasFence = content.includes("```");
  const isExecuting = !isResult && rawArgs === undefined && !content;
  const isBash = /bash|shell/.test(rawName.toLowerCase());

  const pickArg = useCallback((raw?: string | null): string | null => {
    if (!raw?.trim()) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const val = (parsed as Record<string, unknown>).command ?? (parsed as Record<string, unknown>).cmd ?? (parsed as Record<string, unknown>).filePath ?? (parsed as Record<string, unknown>).TargetFile ?? (parsed as Record<string, unknown>).AbsolutePath ?? (parsed as Record<string, unknown>).FilePath ?? (parsed as Record<string, unknown>).Query ?? (parsed as Record<string, unknown>).Pattern ?? (parsed as Record<string, unknown>).prompt ?? (parsed as Record<string, unknown>).query ?? Object.values(parsed)[0];
        if (typeof val === "string" && val.trim()) return val;
      }
    } catch {}
    return null;
  }, []);

  const bashCommand = useMemo(() => {
    if (!isBash) return null;
    return pickArg(rawArgs) ?? pickArg(content) ?? (rawArgs ?? content ?? "");
  }, [isBash, rawArgs, content, pickArg]);

  const preview = useMemo(() => {
    const line = (pickArg(rawArgs) ?? pickArg(content) ?? (rawArgs ?? content ?? "")).split("\n")[0].trim();
    return line.length > 80 ? `${line.slice(0, 80)}…` : line;
  }, [rawArgs, content, pickArg]);

  const rawArgsText = rawArgs !== undefined ? rawArgs : (!isResult && !hasFence ? content : null);

  const toolChunks = useMemo(() => {
    if (!hasFence) return null;
    return parseChunks(content);
  }, [content, hasFence]);

  return (
    <div className="my-2.5 rounded-xl overflow-hidden text-xs font-mono">
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } }}
        className="w-full px-3 py-2 flex items-center gap-2 cursor-pointer select-none"
      >
        {isBash ? (
          <span className="font-semibold text-[var(--text-main)] tracking-tight select-none shrink-0">Shell</span>
        ) : (
          <span className="font-semibold text-[var(--text-main)] tracking-tight select-none shrink-0">{rawName}</span>
        )}
        {preview && (
          <span className="text-[11.5px] text-[var(--text-muted)] truncate min-w-0 flex-1 selectable-text">
            {preview}
          </span>
        )}
        {isExecuting && (
          <span className="flex items-center gap-1.5 text-[10.5px] text-amber-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            running
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-[var(--text-dim)] transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
          aria-hidden
        />
      </div>

      {/* Body */}
      {open && (
        <div className="px-3 py-2.5 space-y-3 animate-fade-in">
          {content && content !== rawArgsText && (
            hasFence && toolChunks ? (
              <div className="space-y-2">
                {toolChunks.map((ch, i) =>
                  ch.type === "code" ? (
                    <CodeBlock key={i} language={ch.lang} code={ch.content} />
                  ) : ch.content.trim() ? (
                    <div key={i} className="border-subtle rounded-lg px-2.5 py-2 text-[var(--text-muted)] selectable-text whitespace-pre-wrap break-words">
                      {ch.content.trim()}
                    </div>
                  ) : null
                )}
              </div>
            ) : (
              <pre className="border-subtle rounded-lg px-2.5 py-2 text-[var(--text-muted)] max-h-80 overflow-y-auto whitespace-pre-wrap break-words selectable-text">
                {content}
              </pre>
            )
          )}
        </div>
      )}
    </div>
  );
}

function ReasonBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-2 rounded-xl border-subtle bg-[var(--bg-card)]/60 text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-1.5 flex items-center justify-between text-[11.5px] text-[var(--text-dim)] hover:text-[var(--text-muted)] cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? "" : "-rotate-90"}`} />
          <span>Thought process / reasoning</span>
        </div>
      </button>
      {open && (
        <div className="px-3.5 py-2 border-subtle-t bg-[var(--bg-input)]/40 text-[11.5px] text-[var(--text-muted)] font-mono leading-relaxed selectable-text whitespace-pre-wrap animate-fade-in">
          {text}
        </div>
      )}
    </div>
  );
}

function MarkdownRenderer({ content = "", role, meta, args, isStreaming }: MarkdownRendererProps) {
  const text = typeof content === "string" ? content : String(content ?? "");
  const chunks = useMarkdownChunks(text);

  if (role === "user") return <UserBubble text={text} />;
  if (role === "tool") return <ToolBlock content={text} meta={meta} args={args} />;
  if (role === "reason") return <ReasonBlock text={text} />;
  if (role === "error") return <div className="my-2.5 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border-subtle text-rose-400 text-xs font-mono">Error: {text}</div>;

  return (
    <div className="my-4 selectable-text">
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
    </div>
  );
}

export default React.memo(MarkdownRenderer);
