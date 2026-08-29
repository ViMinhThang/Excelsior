# Orchestration Plan: Excelsior Codebase Elevation

## Overview
Elevate the Excelsior Go codebase into a clean, idiomatic, modular, type-safe, and robust software architecture.

## Phase 0: Codebase Survey (3 Parallel Explorers)
- **Explorer 1 (Architecture & Decoupling)**: Investigate package structures, coupling, interfaces, and abstractions in `pkg/agent`, `pkg/llm`, `pkg/tools`, `pkg/config`, `cmd/excelsior`.
- **Explorer 2 (Error Handling & Type Safety)**: Investigate ad-hoc errors, panics, stringly-typed errors, wrapping, and error inspection patterns across all packages.
- **Explorer 3 (Testing, Concurrency & Quality)**: Investigate current build, test suite, race conditions, context propagation, linter/vet status, and test coverage gaps.

## Phase 1: Architecture & Decomposition (PROJECT.md)
- Synthesize findings into `PROJECT.md` with:
  - Architecture & Module Boundaries
  - Feature Inventory
  - Milestone Decomposition (M1..MN)
  - Interface Contracts
  - Code Layout
- Set up E2E testing framework plan (`TEST_INFRA.md`).

## Phase 2: Milestone Iteration & Execution
For each milestone:
1. Sub-orchestrator / Specialist dispatch:
   - Explorer(s) formulate implementation plan.
   - Worker implements changes, executes build and test suite, documents results.
   - 2 Reviewers independently evaluate code quality, SOLID principles, API design.
   - 2 Challengers generate stress and edge-case verifications.
   - Forensic Auditor verifies integrity and authenticity (no facade/mock shortcuts).
   - Gate evaluation: strict AND of all criteria.

## Phase 3: E2E Testing Track & Adversarial Coverage Hardening
- Run full opaque-box E2E test suite (Tiers 1-4).
- Tier 5 White-box adversarial testing.

## Phase 4: Final Verification & Audit
- Full verification: `go test -race ./...`, `go vet ./...`, `go build ./cmd/excelsior`.
- Final forensic audit pass.

## Phase 5: Handoff & Human Report
- Synthesize all results, document architecture upgrades, deliver report to parent/user.
