export const INSERT_SESSION = `
  INSERT OR REPLACE INTO sessions (id, started_at, updated_at, metadata)
  VALUES (?, ?, ?, ?)
`;

export const INSERT_EVENT = `
  INSERT OR IGNORE INTO agent_events (id, session_id, sequence, type, timestamp, data, parent_event_id, related_tool_call_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

export const SELECT_PARENT_SESSIONS = `
  SELECT id, started_at, updated_at, metadata
  FROM sessions
  WHERE json_extract(metadata, '$.isChildSession') IS NULL
     OR json_extract(metadata, '$.isChildSession') != 1
  ORDER BY started_at DESC
`;

export const SELECT_CHILD_SESSIONS_EXCLUDING = `
  SELECT id, started_at, updated_at, metadata
  FROM sessions
  WHERE json_extract(metadata, '$.isChildSession') = 1
    AND id != ?
  ORDER BY started_at ASC
`;

export const SELECT_CHILD_SESSIONS_ALL = `
  SELECT id, started_at, updated_at, metadata
  FROM sessions
  WHERE json_extract(metadata, '$.isChildSession') = 1
  ORDER BY started_at ASC
`;

export const SELECT_SESSION_EVENTS = `
  SELECT id, session_id, sequence, type, timestamp, data, parent_event_id, related_tool_call_id
  FROM agent_events
  WHERE session_id = ?
  ORDER BY sequence ASC
`;

export const SELECT_ALL_PARENT_EVENTS = `
  SELECT e.id, e.session_id, e.sequence, e.type, e.timestamp, e.data, e.parent_event_id, e.related_tool_call_id
  FROM agent_events e
  JOIN sessions s ON e.session_id = s.id
  WHERE json_extract(s.metadata, '$.isChildSession') IS NULL
     OR json_extract(s.metadata, '$.isChildSession') != 1
  ORDER BY s.started_at ASC, e.sequence ASC
`;

export const DELETE_ALL_EVENTS = `DELETE FROM agent_events`;

export const DELETE_ALL_SESSIONS = `DELETE FROM sessions`;

export const DELETE_PARENT_SESSIONS = `
  DELETE FROM sessions
  WHERE json_extract(metadata, '$.isChildSession') IS NULL
     OR json_extract(metadata, '$.isChildSession') != 1
`;
