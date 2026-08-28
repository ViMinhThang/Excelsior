// Package tools implements workspace-rooted, secure tools for the agent.
// All file paths are jailed via secureJoin (symlink-aware) and writes are
// atomic. Each tool is a small, single-responsibility type satisfying Tool.
//
// Registry exposes tools as LLM ToolDefinitions. Agent depends on the
// tools.Port, not concrete types, for testability.
package tools
