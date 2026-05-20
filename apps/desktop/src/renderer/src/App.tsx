import React, { useState, useRef, useEffect } from "react";
import { useAgentHost } from "./hooks/useAgentHost.ts";
import {
  FolderOpen,
  MessageSquare,
  Plus,
  Trash2,
  Settings,
  X,
  Play,
  RotateCcw,
  Sparkles,
  Terminal,
  Cpu,
  Check,
  AlertTriangle,
  Send,
  HelpCircle,
  FolderClosed,
  ChevronDown,
  ChevronRight,
  Code
} from "lucide-react";
import type { ProjectedBlock, ToolCallInfo } from "@excelsior/core";

export default function App() {
  const {
    workspacePath,
    state,
    commands,
    settings,
    isInitializing,
    selectWorkspace,
    send,
    cancel,
    executeCommand,
    createSession,
    switchSession,
    deleteSession,
    renameSession,
    toggleMode,
    setMode,
    saveSettings,
    respondToConfirmation,
    approveAllConfirmations,
    clearMessages,
    revertLastTurn,
  } = useAgentHost();

  const [inputVal, setInputVal] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [githubTokenInput, setGithubTokenInput] = useState("");
  const [openToolCalls, setOpenToolCalls] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state?.displayBlocks, state?.isLoading]);

  // Load settings into form inputs when settings are fetched
  useEffect(() => {
    if (settings) {
      setApiKeyInput(settings.deepseekApiKey || "");
      setGithubTokenInput(settings.githubToken || "");
    }
  }, [settings, showSettings]);

  const handleSend = () => {
    if (!inputVal.trim()) return;
    if (inputVal.startsWith("/")) {
      executeCommand(inputVal);
    } else {
      send(inputVal);
    }
    setInputVal("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleToolCall = (id: string) => {
    setOpenToolCalls(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // 1. Workspace selection screen if no workspace path is loaded
  if (!workspacePath) {
    return (
      <div className="flex flex-col h-screen w-screen bg-[#070A13] justify-between relative overflow-hidden select-none">
        {/* Animated ambient backgrounds (No purple!) */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-950/20 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-slate-900/40 blur-[100px] pointer-events-none" />

        {/* Custom Draggable Titlebar */}
        <div className="titlebar select-none">
          <span>EXCELSIOR // DESKTOP BUILD v1.0.0</span>
        </div>

        {/* Central Content */}
        <div className="flex flex-col items-center justify-center flex-grow p-8 text-center max-w-xl mx-auto z-10">
          <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-8 shadow-[0_0_50px_-12px_rgba(16,185,129,0.2)] animate-pulse">
            <Cpu className="w-10 h-10 text-emerald-400" />
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-3">
            EXCELSIOR <span className="text-emerald-400">DESKTOP</span>
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-10">
            A premium, high-performance desktop assistant workspace powered by DeepSeek. Work securely on your local projects, manage automated multi-agent refactoring, and run tests seamlessly.
          </p>

          <button
            onClick={selectWorkspace}
            disabled={isInitializing}
            className="flex items-center gap-3 px-8 py-4 bg-emerald-500 text-emerald-950 font-bold rounded-xl shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 active:scale-95 transition-all duration-150 disabled:opacity-50"
          >
            {isInitializing ? (
              <div className="w-5 h-5 border-2 border-emerald-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <FolderOpen className="w-5 h-5" />
            )}
            Open Workspace Folder
          </button>
        </div>

        <div className="py-6 text-center text-xs font-semibold tracking-wider text-slate-600 z-10 border-t border-slate-900/50">
          POWERED BY DEEPSEEK CODER • GEOMETRIC GRID ARCHITECTURE
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#070A13] text-slate-100 overflow-hidden relative">
      {/* Draggable Titlebar */}
      <div className="titlebar select-none justify-between pr-32">
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-emerald-400" />
          <span>EXCELSIOR // {state?.workspace?.name.toUpperCase() || "WORKSPACE"}</span>
        </div>
        <div className="text-[10px] text-slate-500 font-mono">
          {workspacePath}
        </div>
      </div>

      <div className="flex flex-row flex-grow overflow-hidden">
        {/* ================= LEFT SIDEBAR ================= */}
        <div className="w-64 border-r border-[#1F2937] bg-[#0B0F19] flex flex-col justify-between shrink-0 select-none">
          <div className="flex flex-col flex-grow overflow-hidden p-3 gap-4">
            
            {/* Mode Switcher */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-bold text-slate-500 tracking-widest pl-1 uppercase">Operational Mode</span>
              <div className="grid grid-cols-2 bg-[#070A13] p-0.5 rounded-lg border border-[#1F2937]">
                <button
                  onClick={() => setMode("plan")}
                  className={`py-1.5 text-xs font-bold rounded-md transition-all ${
                    state?.mode === "plan"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Plan
                </button>
                <button
                  onClick={() => setMode("act")}
                  className={`py-1.5 text-xs font-bold rounded-md transition-all ${
                    state?.mode === "act"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Act
                </button>
              </div>
            </div>

            {/* Sessions Header */}
            <div className="flex flex-col flex-grow overflow-hidden gap-1.5">
              <div className="flex items-center justify-between pl-1">
                <span className="text-[9px] font-bold text-slate-500 tracking-widest uppercase">Chat Threads</span>
                <button
                  onClick={() => createSession()}
                  className="p-1 hover:bg-[#1F2937] text-slate-400 hover:text-white rounded-md transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Sessions List */}
              <div className="flex-grow overflow-y-auto space-y-1 pr-1">
                {state?.sessions?.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => switchSession(session.id)}
                    className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border ${
                      state?.currentSessionId === session.id
                        ? "bg-[#111827] border-slate-800 text-emerald-400"
                        : "border-transparent text-slate-400 hover:bg-[#111827]/50 hover:text-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-xs truncate font-medium">{session.title}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(session.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#1F2937] text-slate-500 hover:text-red-400 rounded transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-[#1F2937] flex flex-col gap-2 bg-[#080D17]">
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 w-full p-2 hover:bg-[#1F2937] text-slate-400 hover:text-white rounded-lg transition-colors text-xs font-semibold"
            >
              <Settings className="w-4 h-4" />
              API Settings
            </button>
            <button
              onClick={selectWorkspace}
              className="flex items-center gap-2 w-full p-2 hover:bg-[#1F2937] text-slate-400 hover:text-white rounded-lg transition-colors text-xs font-semibold"
            >
              <FolderClosed className="w-4 h-4" />
              Switch Workspace
            </button>
          </div>
        </div>

        {/* ================= MAIN CHAT AREA ================= */}
        <div className="flex flex-col flex-grow overflow-hidden bg-[#070A13]">
          
          {/* Header toolbar */}
          <div className="h-12 border-b border-[#1F2937] px-4 flex items-center justify-between shrink-0 select-none">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-slate-400">Agent Connected</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={revertLastTurn}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#111827] border border-[#1F2937] text-slate-400 hover:text-white rounded-lg transition-all text-xs font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Revert Last Turn
              </button>
              {state?.isLoading && (
                <button
                  onClick={cancel}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-lg transition-all text-xs font-semibold"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* Message Stream */}
          <div className="flex-grow overflow-y-auto p-4 space-y-6">
            {state?.displayBlocks?.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto select-none opacity-50 p-6">
                <Sparkles className="w-8 h-8 text-emerald-400 mb-4 animate-bounce" />
                <h3 className="text-sm font-semibold text-white mb-1">New Conversation Session</h3>
                <p className="text-xs text-slate-400">
                  Ask the assistant to write features, search your files, or explain system architectures.
                </p>
              </div>
            ) : (
              state?.displayBlocks?.map((block) => (
                <div key={block.id} className="fade-in animate-duration-300">
                  
                  {/* User Prompt */}
                  {block.type === "user" && (
                    <div className="flex flex-row justify-end pl-12">
                      <div className="bg-[#111827] border border-[#1F2937] rounded-xl px-4 py-3 max-w-2xl text-slate-200 text-sm shadow-sm select-text">
                        <div className="text-[10px] font-bold text-slate-500 mb-1 tracking-wider">USER</div>
                        {block.content}
                      </div>
                    </div>
                  )}

                  {/* Assistant response */}
                  {block.type === "assistant" && (
                    <div className="flex flex-row gap-4 pr-12">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0 flex items-center justify-center text-emerald-400">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div className="space-y-1.5 flex-grow select-text">
                        <div className="text-[10px] font-bold text-slate-500 tracking-wider">ASSISTANT</div>
                        {/* Beautiful custom formatted text render (basic markdown support) */}
                        <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                          {block.content}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tool Call Log */}
                  {block.type === "tool-call" && (
                    <div className="flex flex-row gap-4 pr-12">
                      <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 shrink-0 flex items-center justify-center text-slate-400">
                        <Code className="w-4 h-4" />
                      </div>
                      <div className="space-y-1.5 flex-grow">
                        <div className="text-[10px] font-bold text-slate-500 tracking-wider">
                          TOOL OPERATION • {block.status.toUpperCase()}
                        </div>
                        <div className="border border-[#1F2937] bg-[#0B0F19] rounded-lg overflow-hidden">
                          <div
                            onClick={() => toggleToolCall(block.id)}
                            className="flex items-center justify-between p-2.5 bg-[#111827] cursor-pointer hover:bg-[#1F2937]/30 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-xs font-mono font-bold text-slate-300">
                                {block.toolName}
                              </span>
                            </div>
                            {openToolCalls[block.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </div>
                          
                          {openToolCalls[block.id] && (
                            <div className="p-3 border-t border-[#1F2937] space-y-3 font-mono text-[11px] leading-relaxed">
                              <div>
                                <div className="text-slate-500 font-bold mb-1">ARGUMENTS:</div>
                                <pre className="p-2 select-text">{block.toolArgs}</pre>
                              </div>
                              {block.content && (
                                <div>
                                  <div className="text-slate-500 font-bold mb-1">OUTPUT:</div>
                                  <pre className="p-2 select-text max-h-60 overflow-y-auto">{block.content}</pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Subagent feed */}
                  {block.type === "sub-agent" && (
                    <div className="flex flex-row gap-4 pr-12">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0 flex items-center justify-center text-amber-400">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div className="space-y-1.5 flex-grow">
                        <div className="text-[10px] font-bold text-slate-500 tracking-wider">
                          SUB-AGENT • {block.role.toUpperCase()} ({block.state.status.toUpperCase()})
                        </div>
                        <div className="border border-[#1F2937] bg-[#0B0F19] rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2 text-xs">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              block.state.status === "running" ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
                            }`} />
                            <span className="text-slate-400 italic">{block.state.latestLine || "Working..."}</span>
                          </div>
                          {block.state.fullOutput && (
                            <pre className="p-2 text-[10px] max-h-40 overflow-y-auto select-text">
                              {block.state.fullOutput}
                            </pre>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ================= PENDING CONFIRMATION BAR ================= */}
          {state?.pendingConfirmation && (
            <div className="mx-4 mb-4 border border-amber-500/30 bg-amber-950/20 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-pulse select-none">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Manual Approval Required</h4>
                  <p className="text-xs text-slate-300 leading-relaxed mt-0.5">
                    The agent is attempting to run <span className="font-mono text-amber-300 font-semibold">{state.pendingConfirmation.toolName}</span>:
                    <span className="block font-mono text-[10px] bg-slate-950 p-2 rounded border border-slate-900 mt-2 select-text overflow-x-auto">
                      {state.pendingConfirmation.description}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => respondToConfirmation(state.pendingConfirmation!.callId, false)}
                  className="px-4 py-2 border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 active:scale-95 transition-all text-xs font-bold rounded-lg"
                >
                  Deny
                </button>
                <button
                  onClick={() => respondToConfirmation(state.pendingConfirmation!.callId, true)}
                  className="px-4 py-2 border border-emerald-500/20 bg-emerald-500 text-emerald-950 hover:bg-emerald-400 active:scale-95 transition-all text-xs font-bold rounded-lg"
                >
                  Approve
                </button>
              </div>
            </div>
          )}

          {/* Bottom input section */}
          <div className="p-4 border-t border-[#1F2937] bg-[#0B0F19] shrink-0 select-none">
            <div className="flex flex-col gap-2">
              <div className="flex flex-row items-center gap-2 relative">
                <textarea
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message or /command... (Shift+Enter for new line)"
                  className="flex-grow bg-[#070A13] border border-[#1F2937] focus:border-slate-700 outline-none rounded-xl p-3 resize-none h-12 text-sm text-slate-200 placeholder-slate-500 transition-colors select-text pr-12"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputVal.trim() || state?.isLoading}
                  className="absolute right-2 top-2 p-2 bg-emerald-500 text-emerald-950 hover:bg-emerald-400 disabled:opacity-30 disabled:hover:bg-emerald-500 disabled:hover:text-emerald-950 active:scale-95 transition-all rounded-lg"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between px-1 text-[10px] text-slate-500">
                <span>Enter to Send • Shift+Enter for new line</span>
                <span className="font-mono">Ctrl+S for Settings</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ================= SETTINGS DIALOG OVERLAY ================= */}
      {showSettings && (
        <div className="absolute inset-0 bg-[#070A13]/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 select-none animate-fade-in">
          <div className="w-full max-w-md border border-[#1F2937] bg-[#0B0F19] rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-[#1F2937] flex items-center justify-between bg-[#111827]">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Excelsior API Settings</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 hover:bg-[#1F2937] text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-5 space-y-4 text-sm">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">DeepSeek API Key</label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-[#070A13] border border-[#1F2937] focus:border-slate-700 outline-none rounded-lg p-2.5 text-xs text-slate-200 select-text"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">GitHub Token (Optional)</label>
                <input
                  type="password"
                  value={githubTokenInput}
                  onChange={(e) => setGithubTokenInput(e.target.value)}
                  placeholder="ghp_..."
                  className="w-full bg-[#070A13] border border-[#1F2937] focus:border-slate-700 outline-none rounded-lg p-2.5 text-xs text-slate-200 select-text"
                />
              </div>

              <div className="p-3 bg-slate-950/40 border border-slate-900 text-[11px] text-slate-400 rounded-lg leading-relaxed">
                Api keys are encrypted and saved locally inside your machine's app data directories. Excelsior never uploads your keys.
              </div>
            </div>

            <div className="px-5 py-4 border-t border-[#1F2937] flex items-center justify-end gap-2 bg-[#111827]">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 hover:bg-[#1F2937] text-slate-400 hover:text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  saveSettings({
                    deepseekApiKey: apiKeyInput,
                    githubToken: githubTokenInput,
                  });
                  setShowSettings(false);
                }}
                className="px-4 py-2 bg-emerald-500 text-emerald-950 hover:bg-emerald-400 rounded-lg text-xs font-bold transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
