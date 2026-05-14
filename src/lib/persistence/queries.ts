export const INSERT_SESSION = `
  INSERT OR REPLACE INTO sessions (id, started_at, updated_at, metadata, workspace_id, title)
  VALUES (?, ?, ?, ?, ?, ?)
`;

export const SELECT_PARENT_SESSIONS = `
  SELECT id, started_at, updated_at, metadata, workspace_id, title
  FROM sessions
  WHERE json_extract(metadata, '$.isChildSession') IS NULL
     OR json_extract(metadata, '$.isChildSession') != 1
  ORDER BY started_at DESC
`;

export const SELECT_SESSIONS_BY_WORKSPACE = `
  SELECT id, started_at, updated_at, metadata, workspace_id, title
  FROM sessions
  WHERE workspace_id = ?
    AND (json_extract(metadata, '$.isChildSession') IS NULL OR json_extract(metadata, '$.isChildSession') != 1)
  ORDER BY updated_at DESC
`;

export const SELECT_CHILD_SESSIONS_EXCLUDING = `
  SELECT id, started_at, updated_at, metadata, workspace_id, title
  FROM sessions
  WHERE json_extract(metadata, '$.isChildSession') = 1
    AND id != ?
  ORDER BY started_at ASC
`;

export const SELECT_CHILD_SESSIONS_ALL = `
  SELECT id, started_at, updated_at, metadata, workspace_id, title
  FROM sessions
  WHERE json_extract(metadata, '$.isChildSession') = 1
  ORDER BY started_at ASC
`;

export const UPDATE_SESSION_TITLE = `
  UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?
`;

export const DELETE_SESSION = `DELETE FROM sessions WHERE id = ? AND (json_extract(metadata, '$.isChildSession') IS NULL OR json_extract(metadata, '$.isChildSession') != 1)`;

export const DELETE_ALL_SESSIONS = `DELETE FROM sessions`;

export const DELETE_PARENT_SESSIONS = `
  DELETE FROM sessions
  WHERE json_extract(metadata, '$.isChildSession') IS NULL
     OR json_extract(metadata, '$.isChildSession') != 1
`;
