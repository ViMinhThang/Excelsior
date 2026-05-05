import { db, logObservation } from "../../db/index.js";
import { Message, PAGE_SIZE } from "../../types.js";

export function loadMessages(limit: number = PAGE_SIZE, offset: number = 0): Message[] {
  const rows = db
    .prepare(
      "SELECT id, role, content, metadata, timestamp FROM observation ORDER BY timestamp DESC LIMIT ? OFFSET ?",
    )
    .all(limit, offset) as any[];

  return rows.reverse().map((row: any) => {
    const metadata = row.metadata ? JSON.parse(row.metadata) : {};
    
    return {
      id: String(row.id),
      role: row.role === "tool" ? "tool-call" : row.role,
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

export function getMessageCount(): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM observation").get() as any;
  return row.count;
}

export function persistMessage(message: Message): void {
  const dbRole = message.role === "tool-call" ? "tool" : message.role;
  if (!message.content && message.role !== "assistant") return;
  
  const metadata = {
    ...(message.toolCall ? { toolCall: message.toolCall } : {}),
    ...(message.toolCalls ? { toolCalls: message.toolCalls } : {}),
  };
  
  logObservation(
    dbRole as any, 
    message.content, 
    Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : undefined
  );
}
