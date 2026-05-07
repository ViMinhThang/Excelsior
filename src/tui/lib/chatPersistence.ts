import Database from "better-sqlite3";
import { getDb } from "../../db/index.js";
import { Message, PAGE_SIZE } from "../../types.js";

interface ObservationRow {
  id: number;
  message_id: string | null;
  role: string;
  content: string;
  metadata: string | null;
  timestamp: string;
}

interface CountRow {
  count: number;
}

export function loadMessages(limit: number = PAGE_SIZE, offset: number = 0, db?: Database.Database): Message[] {
  const _db = db ?? getDb();
  const rows = _db
    .prepare(
      "SELECT id, message_id, role, content, metadata, timestamp FROM observation ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?",
    )
    .all(limit, offset) as ObservationRow[];

  return rows.reverse().map((row) => {
    const metadata = row.metadata ? JSON.parse(row.metadata) : {};

    return {
      id: row.message_id || String(row.id),
      role: (row.role === "tool" ? "tool-call" : row.role) as Message["role"],
      content: row.content,
      timestamp: row.timestamp,
      ...(row.role === "tool" || metadata.toolCall
        ? {
            toolCall: {
              ...(metadata.toolCall || {
                toolName: "tool",
                toolArgs: "",
                toolCallId: `restored_${row.id}`,
              }),
              status: metadata.toolCall?.status === "error" ? "error" : "completed",
            },
          }
        : {}),
      ...(metadata.toolCalls ? { toolCalls: metadata.toolCalls } : {}),
    };
  });
}

export function getMessageCount(db?: Database.Database): number {
  const _db = db ?? getDb();
  const row = _db.prepare("SELECT COUNT(*) as count FROM observation").get() as CountRow;
  return row.count;
}

export function persistMessage(message: Message, db?: Database.Database): void {
  const _db = db ?? getDb();
  const dbRole = message.role === "tool-call" ? "tool" : message.role;
  if (!message.content && message.role !== "assistant") return;

  const metadata = {
    ...(message.toolCall ? { toolCall: message.toolCall } : {}),
    ...(message.toolCalls ? { toolCalls: message.toolCalls } : {}),
  };

  const statement = _db.prepare(`
    INSERT INTO observation (role, content, metadata, message_id)
    VALUES (?, ?, ?, ?)
  `);
  statement.run(
    dbRole,
    message.content,
    Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
    message.id || null,
  );
}

