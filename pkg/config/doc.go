// Package config resolves DeepSeek-first settings from environment variables
// with validation and model alias resolution.
//
// Source of truth is env (DEEPSEEK_API_KEY, DEEPSEEK_MODEL, etc.); CLI flags
// override. [FromEnv] reads env, [Config.Validate] validates, and
// [ResolveWorkspace] resolves the workspace directory with flag > env > cwd
// precedence.
package config
