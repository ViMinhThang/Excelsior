import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const report = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Architecture review — Excelsior</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
      mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "loose" });
    </script>
    <style>
      .seam { stroke-dasharray: 4 4; }
      .leak { stroke: #dc2626; }
      .deep { background: linear-gradient(135deg, #0f172a, #1e293b); }
      .fragmented { background: repeating-linear-gradient(45deg, #fef3c7, #fef3c7 8px, #fffbeb 8px, #fffbeb 16px); }
      .badge-strong { background: #059669; color: white; padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
      .badge-explore { background: #d97706; color: white; padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
      .badge-speculative { background: #64748b; color: white; padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
      .callout-amber { background: #fffbeb; border-left: 4px solid #d97706; padding: 0.75rem 1rem; border-radius: 0.375rem; font-size: 0.875rem; }
      .god-module { background: linear-gradient(135deg, #7f1d1d, #991b1b); }
      .internal { opacity: 0.4; }
    </style>
  </head>
  <body class="bg-stone-50 text-slate-900 font-sans antialiased">
    <main class="max-w-5xl mx-auto px-6 py-12 space-y-12">

      <!-- Header -->
      <header class="border-b border-slate-200 pb-6">
        <h1 class="text-3xl font-bold tracking-tight">Architecture review — Excelsior</h1>
        <div class="flex items-center gap-4 mt-2 text-sm text-slate-500">
          <span>2025-07-07</span>
          <span class="w-1 h-1 rounded-full bg-slate-300"></span>
          <span>5 packages, 2 apps</span>
        </div>
        <div class="flex gap-4 mt-4 text-xs">
          <span class="flex items-center gap-1"><span class="w-3 h-3 inline-block border border-slate-700 bg-white rounded"></span> module</span>
          <span class="flex items-center gap-1"><span class="w-3 h-3 inline-block border border-dashed border-slate-400 rounded"></span> seam</span>
          <span class="flex items-center gap-1"><span class="w-3 h-3 inline-block bg-red-500 rounded"></span> leakage</span>
          <span class="flex items-center gap-1"><span class="w-3 h-3 inline-block bg-slate-800 rounded"></span> deep module</span>
        </div>
      </header>

      <!-- Candidates -->
      <section id="candidates" class="space-y-10">

        <!-- Candidate 1: HarnessStore God object -->
        <article class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="p-6 space-y-4">
            <div class="flex items-start justify-between">
              <h2 class="text-xl font-bold">Break up the HarnessStore God object</h2>
              <span class="badge-strong shrink-0 mt-1">Strong</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <span class="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-mono">in-process</span>
              <span class="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">locality</span>
              <span class="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">testability</span>
            </div>
            <div class="text-sm font-mono text-slate-500 space-y-0.5">
              <div>packages/agent-harness/src/harness.ts (400+ lines)</div>
              <div>packages/agent-harness/src/types.ts</div>
              <div>packages/agent-harness/src/events.ts</div>
            </div>

            <!-- Before / After diagram -->
            <div class="grid grid-cols-2 gap-6 mt-4">
              <!-- Before -->
              <div>
                <div class="text-xs uppercase tracking-wider text-slate-400 mb-2 font-semibold">Before</div>
                <div class="rounded-lg border border-slate-200 bg-white p-4">
                  <div class="flex flex-col items-center">
                    <div class="text-xs uppercase tracking-wider text-slate-400 mb-2">Callers</div>
                    <div class="flex gap-3 mb-4">
                      <div class="px-3 py-1.5 text-xs border border-slate-300 rounded bg-stone-50 text-slate-600">TUI</div>
                      <div class="px-3 py-1.5 text-xs border border-slate-300 rounded bg-stone-50 text-slate-600">Desktop</div>
                    </div>
                    <svg width="200" height="20" class="mb-2">
                      <line x1="100" y1="0" x2="100" y2="20" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 4" />
                      <polygon points="96,18 100,22 104,18" fill="#94a3b8" />
                    </svg>
                    <div class="w-full rounded-lg border-2 border-red-400 bg-red-50 p-3">
                      <div class="text-xs font-bold text-center text-red-700 mb-1">HarnessStore</div>
                      <div class="text-[10px] text-red-600 space-y-0.5 text-center">
                        <div>session management</div>
                        <div>event storage</div>
                        <div>run orchestration</div>
                        <div>skill discovery</div>
                        <div>settings</div>
                        <div>confirmation / question</div>
                        <div>compaction</div>
                        <div>state snapshotting</div>
                        <div>...</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <!-- After -->
              <div>
                <div class="text-xs uppercase tracking-wider text-slate-400 mb-2 font-semibold">After</div>
                <div class="rounded-lg border border-slate-200 bg-white p-4">
                  <div class="flex flex-col items-center">
                    <div class="text-xs uppercase tracking-wider text-slate-400 mb-2">Callers</div>
                    <div class="flex gap-3 mb-4">
                      <div class="px-3 py-1.5 text-xs border border-slate-300 rounded bg-stone-50 text-slate-600">TUI</div>
                      <div class="px-3 py-1.5 text-xs border border-slate-300 rounded bg-stone-50 text-slate-600">Desktop</div>
                    </div>
                    <svg width="200" height="20" class="mb-2">
                      <line x1="100" y1="0" x2="100" y2="20" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 4" />
                      <polygon points="96,18 100,22 104,18" fill="#94a3b8" />
                    </svg>
                    <!-- Narrow deep interface -->
                    <div class="w-full rounded-lg border-2 border-emerald-500 bg-emerald-50 p-2 mb-2">
                      <div class="text-xs font-bold text-center text-emerald-700">AgentHarness (interface)</div>
                    </div>
                    <svg width="180" height="16" class="mb-1">
                      <line x1="90" y1="0" x2="90" y2="16" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="3 3" />
                      <polygon points="87,14 90,18 93,14" fill="#94a3b8" />
                    </svg>
                    <div class="w-full rounded-lg border border-slate-300 bg-slate-800 p-2.5">
                      <div class="text-xs font-bold text-center text-white mb-1">HarnessStore</div>
                      <div class="text-[10px] text-slate-300 text-center">
                        <span class="internal">session manager, event store,</span>
                        <span class="internal">run orchestrator, skill registry,</span>
                        <span class="internal">settings persistence, confirmation router,</span>
                        <span class="internal">compaction, snapshot builder</span>
                      </div>
                      <div class="mt-1.5 text-center">
                        <span class="text-[10px] text-emerald-300 italic">internals hidden behind seam</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p class="text-sm text-slate-700"><span class="font-semibold">Problem:</span> HarnessStore is a god object — 9+ responsibilities packed into one class with no internal seams. Changes ripple through the whole class.</p>
            <p class="text-sm text-slate-700"><span class="font-semibold">Solution:</span> Split into focused modules (session manager, event store, run orchestrator, snapshot builder) behind the existing AgentHarness interface. HarnessStore composes them but each is independently testable.</p>
            <ul class="text-sm text-slate-600 list-disc list-inside space-y-0.5">
              <li><span class="font-medium">locality:</span> bugs in session logic don't require reading run orchestration</li>
              <li><span class="font-medium">leverage:</span> one seam, N callers (TUI, desktop, tests)</li>
              <li><span class="font-medium">testability:</span> isolation for session replay, compaction, confirmation routing</li>
              <li><span class="font-medium">interface shrinks;</span> internals absorb ~300 lines of procedural wiring</li>
            </ul>
            <div class="callout-amber text-slate-700">
              <span class="font-semibold">Contradicts ADR-0001?</span> No — the ADR advocates keeping policy seams focused, which is exactly what this enables. The AgentHarness <em>interface</em> stays; only the implementation decomposes.
            </div>
          </div>
        </article>

        <!-- Candidate 2: Two state machines for the same concept -->
        <article class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="p-6 space-y-4">
            <div class="flex items-start justify-between">
              <h2 class="text-xl font-bold">Unify assistant-message state machines</h2>
              <span class="badge-explore shrink-0 mt-1">Worth exploring</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <span class="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-mono">in-process</span>
              <span class="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">locality</span>
            </div>
            <div class="text-sm font-mono text-slate-500 space-y-0.5">
              <div>packages/agent-harness/src/runController.ts — AssistantMessageBuilder (lines 341–386)</div>
              <div>packages/agent-harness/src/runController.ts — tool input buffers (lines 39–43, 434–503)</div>
              <div>packages/agent-harness/src/projection.ts — AssistantDraft, ToolDraft (lines 26–42)</div>
              <div>packages/agent-harness/src/projection.ts — projectEvents flush logic (lines 82–119)</div>
            </div>

            <div class="grid grid-cols-2 gap-6 mt-4">
              <div>
                <div class="text-xs uppercase tracking-wider text-slate-400 mb-2 font-semibold">Before</div>
                <div class="rounded-lg border border-slate-200 bg-white p-4">
                  <pre class="mermaid">
                    flowchart LR
                      RC[RunController] --> ASM[AssistantMessageBuilder<br/>start / update / end]
                      RC --> TIB[tool input buffers<br/>queue / flush]
                      ASM -.emit.-> EVENTS[(Events)]
                      TIB -.emit.-> EVENTS
                      EVENTS --> PROJ[projectEvents]
                      PROJ --> AD[AssistantDraft<br/>start / upsert / flush]
                      PROJ --> TD[ToolDraft<br/>start / upsert / flush]
                      class RC,PROJ leak;
                      class ASM,TIB,AD,TD internal;
                      classDef leak stroke:#dc2626,stroke-width:2px;
                      classDef internal stroke:#94a3b8,stroke-dasharray:4 4;
                  </pre>
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wider text-slate-400 mb-2 font-semibold">After</div>
                <div class="rounded-lg border border-slate-200 bg-white p-4">
                  <div class="flex flex-col items-center justify-center h-48">
                    <div class="w-full rounded-lg border-2 border-emerald-500 bg-emerald-50 p-3 mb-2">
                      <div class="text-xs font-bold text-center text-emerald-700">AssistantStateMachine</div>
                      <div class="text-[10px] text-emerald-600 text-center mt-1">single source of truth: text + tool tracking</div>
                    </div>
                    <svg width="160" height="16" class="mb-1">
                      <line x1="80" y1="0" x2="80" y2="16" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="3 3" />
                      <polygon points="77,14 80,18 83,14" fill="#94a3b8" />
                    </svg>
                    <div class="w-full rounded-lg border border-slate-300 bg-slate-800 p-2.5">
                      <div class="text-xs font-bold text-center text-white">projection</div>
                      <div class="text-[10px] text-slate-300 text-center mt-0.5">
                        <span class="internal">reads final states, no re-derivation</span>
                      </div>
                    </div>
                    <div class="mt-2 text-[10px] text-slate-400 text-center italic">
                      one state machine, consumed by emitter + projector
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p class="text-sm text-slate-700"><span class="font-semibold">Problem:</span> RunController builds assistant text and tracks tool input through AssistantMessageBuilder and tool buffers, then projection.ts rebuilds the same state from events (AssistantDraft, ToolDraft). Two state machines for one concept — if one drifts, display bugs emerge silently.</p>
            <p class="text-sm text-slate-700"><span class="font-semibold">Solution:</span> Extract an AssistantStateMachine that both RunController and projection share. RunController pushes into it; projection reads final states directly instead of re-deriving from events.</p>
            <ul class="text-sm text-slate-600 list-disc list-inside space-y-0.5">
              <li><span class="font-medium">locality:</span> assistant-tracking logic concentrated in one place</li>
              <li><span class="font-medium">testability:</span> single seam for message-building behaviour</li>
              <li><span class="font-medium">delete:</span> ~50 lines of duplicated flush/upsert logic from projection.ts</li>
            </ul>
          </div>
        </article>

        <!-- Candidate 3: ConversationPresentation fragmentation -->
        <article class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="p-6 space-y-4">
            <div class="flex items-start justify-between">
              <h2 class="text-xl font-bold">Consolidate conversation presentation modules</h2>
              <span class="badge-strong shrink-0 mt-1">Strong</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <span class="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-mono">in-process</span>
              <span class="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">locality</span>
              <span class="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">depth</span>
            </div>
            <div class="text-sm font-mono text-slate-500 space-y-0.5">
              <div>packages/core/src/conversationPresentation/ (14 files)</div>
              <div>types.ts · toolArgs.ts · toolText.ts</div>
              <div>fileChangePreviewParser.ts · fileChangePreviewFrame.ts · fileChangePreviewNavigation.ts · fileChangePreviewConstants.ts</div>
              <div>toolDisplayRegistry.ts · toolDisplayRegistryCore.ts · createToolDisplay.ts</div>
              <div>fileToolDisplays.ts · readToolDisplays.ts · miscToolDisplays.ts · runCommandDisplay.ts</div>
            </div>

            <!-- Cross-section diagram showing shallowness -->
            <div class="grid grid-cols-2 gap-6 mt-4">
              <div>
                <div class="text-xs uppercase tracking-wider text-slate-400 mb-2 font-semibold">Before</div>
                <div class="rounded-lg border border-slate-200 bg-white p-4">
                  <div class="space-y-0.5 text-[10px] font-mono">
                    <div class="bg-amber-100 border border-amber-300 px-2 py-1 rounded text-amber-800 text-center">fileChangePreviewConstants.ts (2 lines)</div>
                    <div class="bg-amber-50 border border-amber-200 px-2 py-1 rounded text-center text-slate-500">fileChangePreviewNavigation.ts (19 lines)</div>
                    <div class="bg-amber-50 border border-amber-200 px-2 py-1 rounded text-center text-slate-500">toolDisplayRegistryCore.ts (14 lines)</div>
                    <div class="bg-amber-50 border border-amber-200 px-2 py-1 rounded text-center text-slate-500">miscToolDisplays.ts (28 lines)</div>
                    <div class="bg-stone-50 border border-stone-200 px-2 py-1.5 rounded text-center text-slate-400">...10 more files...</div>
                    <div class="text-center text-[9px] text-slate-400 mt-1 italic">14 modules — each nearly as wide as its interface</div>
                    <div class="text-center text-[9px] text-amber-600 mt-0.5">deletion test: delete any and nothing collapses</div>
                  </div>
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wider text-slate-400 mb-2 font-semibold">After</div>
                <div class="rounded-lg border border-slate-200 bg-white p-4">
                  <div class="flex flex-col items-center justify-center" style="min-height:200px">
                    <div class="w-full rounded-lg border-2 border-emerald-500 bg-emerald-50 p-2.5 mb-1">
                      <div class="text-xs font-bold text-center text-emerald-700">conversationPresentation.ts</div>
                      <div class="text-[10px] text-emerald-600 text-center mt-0.5">~400 lines, 1 barrel export</div>
                    </div>
                    <div class="text-[10px] text-slate-400 text-center italic mb-3">interface: createToolDisplay + types</div>
                    <div class="w-full rounded-lg border border-slate-300 bg-slate-800 p-2">
                      <div class="text-[10px] text-slate-300 text-center">
                        <span class="internal">tool configs, arg parsers, text helpers,</span>
                        <span class="internal">diff parsers, frame builders, registry</span>
                      </div>
                      <div class="mt-1 text-center">
                        <span class="text-[10px] text-emerald-300 italic">all behind one seam</span>
                      </div>
                    </div>
                    <div class="text-[9px] text-slate-400 mt-2">interface: 1 module · depth: high</div>
                  </div>
                </div>
              </div>
            </div>

            <p class="text-sm text-slate-700"><span class="font-semibold">Problem:</span> 14 files in conversationPresentation/ with several under 30 lines. Each is a shallow module — interface nearly as complex as implementation. Understanding how a tool call becomes a display requires opening 7+ files.</p>
            <p class="text-sm text-slate-700"><span class="font-semibold">Solution:</span> Collapse into 3–4 natural groups: types + factory (1 file), diff preview (1 file), tool displays + registry (1 file). Keep depth where there's actual independence (arg parsing != diff framing).</p>
            <ul class="text-sm text-slate-600 list-disc list-inside space-y-0.5">
              <li><span class="font-medium">locality:</span> display logic lives in one place, not 14</li>
              <li><span class="font-medium">leverage:</span> one import instead of understanding a directory</li>
              <li><span class="font-medium">interface shrinks:</span> 14 barrel exports → 3</li>
            </ul>
          </div>
        </article>

        <!-- Candidate 4: AgentHostClient pass-through wrapper -->
        <article class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="p-6 space-y-4">
            <div class="flex items-start justify-between">
              <h2 class="text-xl font-bold">Deepen AgentHostClient into a policy holder</h2>
              <span class="badge-explore shrink-0 mt-1">Worth exploring</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <span class="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-mono">in-process</span>
              <span class="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">depth</span>
            </div>
            <div class="text-sm font-mono text-slate-500 space-y-0.5">
              <div>packages/client/src/hostActions.ts — AgentHostClient (122 lines)</div>
              <div>packages/client/src/hostContract.ts — AgentHost interface</div>
              <div>apps/tui/src/hooks/useAgentHostClient.ts — 98 lines of useCallback wrappers</div>
            </div>

            <!-- Mass diagram -->
            <div class="grid grid-cols-2 gap-6 mt-4">
              <div>
                <div class="text-xs uppercase tracking-wider text-slate-400 mb-2 font-semibold">Before</div>
                <div class="rounded-lg border border-slate-200 bg-white p-4">
                  <div class="flex items-end gap-2 justify-center" style="height:160px">
                    <div class="flex flex-col items-center">
                      <div class="text-[10px] text-slate-400 mb-1">interface</div>
                      <div class="w-20 bg-amber-300 rounded-t" style="height:140px"></div>
                      <div class="text-[9px] text-slate-400 mt-1">14 methods</div>
                    </div>
                    <div class="flex flex-col items-center">
                      <div class="text-[10px] text-slate-400 mb-1">implementation</div>
                      <div class="w-20 bg-stone-300 rounded-t" style="height:146px"></div>
                      <div class="text-[9px] text-slate-400 mt-1">14 dispatch calls</div>
                    </div>
                  </div>
                  <div class="text-center text-[10px] text-slate-400 mt-1">interface ≈ implementation height (shallow)</div>
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wider text-slate-400 mb-2 font-semibold">After</div>
                <div class="rounded-lg border border-slate-200 bg-white p-4">
                  <div class="flex items-end gap-2 justify-center" style="height:160px">
                    <div class="flex flex-col items-center">
                      <div class="text-[10px] text-slate-400 mb-1">interface</div>
                      <div class="w-20 bg-emerald-400 rounded-t" style="height:140px"></div>
                      <div class="text-[9px] text-slate-400 mt-1">14 methods</div>
                    </div>
                    <div class="flex flex-col items-center">
                      <div class="text-[10px] text-slate-400 mb-1">implementation</div>
                      <div class="w-20 bg-slate-700 rounded-t" style="height:200px"></div>
                      <div class="text-[9px] text-slate-400 mt-1">+ caching, batching, retry</div>
                    </div>
                  </div>
                  <div class="text-center text-[10px] text-slate-400 mt-1">interface same width, implementation deeper</div>
                </div>
              </div>
            </div>

            <p class="text-sm text-slate-700"><span class="font-semibold">Problem:</span> AgentHostClient is a pass-through — every method is \`this.host.dispatch({type: ...})\`. The interface is as wide as the implementation. Meanwhile, the TUI client wraps it again in useCallback boilerplate (98 lines).</p>
            <p class="text-sm text-slate-700"><span class="font-semibold">Solution:</span> Move client-side policy into AgentHostClient: optimistic UI updates, cancellable sends, event deduplication, or state caching. The dispatch interface stays wide but the module earns its keep.</p>
            <ul class="text-sm text-slate-600 list-disc list-inside space-y-0.5">
              <li><span class="font-medium">locality:</span> client policy concentrates here instead of leaking into hooks</li>
              <li><span class="font-medium">leverage:</span> one place to add retry/caching, N clients benefit</li>
            </ul>
            <div class="callout-amber text-slate-700">
              <span class="font-semibold">Note:</span> Only worth pursuing if client-side policy is needed. If all clients remain thin wrappers with no shared policy, this candidate is <em>Speculative</em> — and the deletion test passes (the complexity would reappear in each client).
            </div>
          </div>
        </article>

        <!-- Candidate 5: Skills module is deeper than it looks -->
        <article class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="p-6 space-y-4">
            <div class="flex items-start justify-between">
              <h2 class="text-xl font-bold">Surface SkillsManager as a tested seam</h2>
              <span class="badge-explore shrink-0 mt-1">Worth exploring</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <span class="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-mono">local-substitutable</span>
            </div>
            <div class="text-sm font-mono text-slate-500 space-y-0.5">
              <div>packages/agent-harness/src/skills/SkillCatalog.ts</div>
              <div>packages/agent-harness/src/skills/SkillsManager.ts</div>
              <div>packages/agent-harness/src/harness.ts (skill registration, lines 112–163)</div>
            </div>

            <div class="grid grid-cols-2 gap-6 mt-4">
              <div>
                <div class="text-xs uppercase tracking-wider text-slate-400 mb-2 font-semibold">Before</div>
                <div class="rounded-lg border border-slate-200 bg-white p-4">
                  <pre class="mermaid">
                    flowchart LR
                      HS[HarnessStore] --> SC[SkillCatalog]
                      SC --> SM[SkillsManager]
                      HS -- inline: register tools/commands --> HS
                      class HS leak;
                      classDef leak stroke:#dc2626,stroke-width:2px;
                  </pre>
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wider text-slate-400 mb-2 font-semibold">After</div>
                <div class="rounded-lg border border-slate-200 bg-white p-4">
                  <div class="flex flex-col items-center justify-center" style="min-height:160px">
                    <div class="text-xs text-slate-400 mb-2">SkillRegistry interface</div>
                    <div class="flex gap-3">
                      <div class="px-3 py-2 text-xs border-2 border-emerald-400 rounded bg-emerald-50 text-emerald-700">SkillCatalog<br/><span class="text-[10px] font-normal text-emerald-500">(prod)</span></div>
                      <div class="px-3 py-2 text-xs border-2 border-dashed border-slate-300 rounded bg-white text-slate-400">InMemorySkillRegistry<br/><span class="text-[10px] font-normal">(tests)</span></div>
                    </div>
                    <div class="flex gap-2 mt-2">
                      <span class="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500">HS → interface → adapter</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p class="text-sm text-slate-700"><span class="font-semibold">Problem:</span> SkillsManager reads directly from the filesystem. Skill discovery and tool/command registration are inlined in HarnessStore constructor (lines 112–163). Tests that touch skill loading must mock the filesystem.</p>
            <p class="text-sm text-slate-700"><span class="font-semibold">Solution:</span> Introduce a SkillRegistry interface at a seam. SkillCatalog becomes the filesystem adapter. HarnessStore receives SkillRegistry via config. Tests inject an in-memory fake.</p>
            <ul class="text-sm text-slate-600 list-disc list-inside space-y-0.5">
              <li><span class="font-medium">testability:</span> no filesystem I/O in skill registration tests</li>
              <li><span class="font-medium">locality:</span> skill registration logic moves out of constructor</li>
              <li><span class="font-medium">leverage:</span> skill system becomes independently testable</li>
            </ul>
            <div class="callout-amber text-slate-700">
              <span class="font-semibold">Consistent with ADR-0001:</span> This adds a seam with two adapters — exactly what the ADR encourages.
            </div>
          </div>
        </article>

      </section>

      <!-- Top recommendation -->
      <section id="top-recommendation" class="bg-slate-800 rounded-xl shadow-sm p-8 text-white">
        <h2 class="text-2xl font-bold mb-2">Top recommendation</h2>
        <p class="text-slate-300 mb-4">
          <span class="font-semibold text-white">Break up the HarnessStore God object</span> — tackle this first.
        </p>
        <div class="grid md:grid-cols-3 gap-4 text-sm">
          <div class="bg-slate-700/50 rounded-lg p-3">
            <div class="font-semibold text-emerald-400 mb-1">Why first</div>
            <p class="text-slate-300">Every other candidate benefits: splitting projection decoupling, skills seam extraction, and client policy addition all become easier when HarnessStore isn't a monolithic blocker.</p>
          </div>
          <div class="bg-slate-700/50 rounded-lg p-3">
            <div class="font-semibold text-emerald-400 mb-1">What it unlocks</div>
            <p class="text-slate-300">Independent testing of session lifecycle, event storage, run orchestration, and snapshot logic. The most net leverage per unit of refactoring effort.</p>
          </div>
          <div class="bg-slate-700/50 rounded-lg p-3">
            <div class="font-semibold text-emerald-400 mb-1">What won't change</div>
            <p class="text-slate-300">The AgentHarness interface stays. No callers change. No package boundaries shift. It's purely an implementation decomposition behind an existing seam.</p>
          </div>
        </div>
        <p class="text-sm text-slate-400 mt-4">
          <a href="#candidates" class="text-emerald-400 underline">← Back to all candidates</a>
        </p>
      </section>

    </main>
  </body>
</html>`;

const path = join(tmpdir(), "architecture-review-2025-07-07.html");
writeFileSync(path, report, "utf-8");
console.log("Report written to:", path);
