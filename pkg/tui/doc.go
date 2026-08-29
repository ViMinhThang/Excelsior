// Package tui is the interactive Bubble Tea UI. It renders a monochrome
// transcript (viewport + scrollbar), a one-line prompt, and an askQuestion
// overlay (3 options + manual input). It depends on [agent.Agent] via
// [Config.Agent] (or a remote engine via [Config.EngineURL]) but agent has
// no TUI knowledge.
//
// Entry points are [Run] (blocking) and [New] (returns a tea.Model).
package tui
