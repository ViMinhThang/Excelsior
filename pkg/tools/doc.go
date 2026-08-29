// Package tools implements workspace-rooted, secure tools for the agent.
// All file paths are jailed via secureJoin (symlink-aware) and writes are
// atomic (temp+rename+fsync). Each tool is a small, single-responsibility
// type satisfying [Tool].
//
// The [Registry] exposes tools as LLM ToolDefinitions. [agent.Agent] depends
// on the registry via a small interface, not concrete types, for testability.
// Use [DefaultRegistry] to get the core 8 tools rooted at a workspace
// directory: view, ls, glob, grep, write, edit, bash, askQuestion.
//
// Resource limits are enforced via MaxFileReadSize, MaxWriteSize, etc.
package tools
