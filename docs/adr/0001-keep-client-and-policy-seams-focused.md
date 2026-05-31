# ADR 0001: Keep Client and Policy Seams Focused

## Status

Accepted

## Context

Excelsior has multiple clients over the same agent host and event model. The codebase is easier to change when shared policy is not embedded directly in rendering modules, storage adapters, or run orchestration.

Recent refactors split tool presentation, chat modes, desktop settings, run replay, and run persistence into focused modules. The same direction should guide future changes.

## Decision

- Keep app clients on public package interfaces instead of host internals.
- Keep persistence adapters focused on IO and delegate replay/checkpoint policy to pure modules.
- Keep run orchestration focused on lifecycle and delegate persistence mechanics to a dedicated module.
- Keep UI shells responsible for layout and state wiring, while tab, row, dialog, and model logic live in smaller modules.
- Add direct tests for new policy seams when behavior can be verified without rendering a whole client.

## Consequences

- Some packages expose small policy modules for tests and reuse.
- Module count increases, but locality improves because behavior changes are concentrated behind named seams.
- Architecture tests should continue protecting package direction and casual `any` usage.
