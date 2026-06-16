import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from "vscode-jsonrpc/node";
import {
  DidChangeTextDocumentNotification,
  DidOpenTextDocumentNotification,
  DiagnosticSeverity,
  InitializedNotification,
  InitializeRequest,
  PublishDiagnosticsNotification,
  type Diagnostic,
  type InitializeParams,
} from "vscode-languageserver-protocol";

const DIAGNOSTIC_WAIT_MS = 1_500;

export interface LspDiagnostic {
  severity: "error" | "warning" | "information" | "hint";
  line: number;
  column: number;
  message: string;
  source?: string;
}

export interface LspSyncResult {
  diagnostics: LspDiagnostic[];
  notice?: string;
}

export interface LspLanguageAdapter {
  readonly id: string;
  supports(filePath: string): boolean;
  syncFile(input: {
    filePath: string;
    content: string;
    abortSignal?: AbortSignal;
  }): Promise<LspSyncResult>;
  dispose(): void;
}

export interface LspClient {
  syncTouchedFile(input: {
    filePath: string;
    content: string;
    abortSignal?: AbortSignal;
  }): Promise<string | null>;
  dispose(): void;
}

export class LspManager implements LspClient {
  constructor(private readonly adapters: LspLanguageAdapter[]) {}

  static create(workspaceRoot: string): LspManager {
    return new LspManager([new TypeScriptLspAdapter(workspaceRoot)]);
  }

  async syncTouchedFile(input: {
    filePath: string;
    content: string;
    abortSignal?: AbortSignal;
  }): Promise<string | null> {
    const adapter = this.adapters.find((candidate) => candidate.supports(input.filePath));
    if (!adapter) return null;

    const result = await adapter.syncFile(input);
    if (result.diagnostics.length > 0) {
      return formatDiagnostics(input.filePath, result.diagnostics);
    }
    return result.notice ? `LSP diagnostics for ${input.filePath}:\n${result.notice}` : null;
  }

  dispose(): void {
    for (const adapter of this.adapters) adapter.dispose();
  }
}

export class TypeScriptLspAdapter implements LspLanguageAdapter {
  readonly id = "typescript";
  private server?: TypeScriptServerSession;

  constructor(private readonly workspaceRoot: string) {}

  supports(filePath: string): boolean {
    return [".ts", ".tsx"].includes(extname(filePath));
  }

  async syncFile(input: {
    filePath: string;
    content: string;
    abortSignal?: AbortSignal;
  }): Promise<LspSyncResult> {
    try {
      const server = await withAbort(
        this.ensureServer(),
        input.abortSignal,
        "LSP diagnostics cancelled.",
      );
      return await withAbort(
        server.syncFile(input.filePath, input.content),
        input.abortSignal,
        "LSP diagnostics cancelled.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { diagnostics: [], notice: `Unavailable: ${message}` };
    }
  }

  dispose(): void {
    this.server?.dispose();
    this.server = undefined;
  }

  private async ensureServer(): Promise<TypeScriptServerSession> {
    if (!this.server) {
      const server = new TypeScriptServerSession(this.workspaceRoot);
      this.server = server;
      try {
        await server.start();
      } catch (err) {
        if (this.server === server) this.server = undefined;
        server.dispose();
        throw err;
      }
    }
    return this.server;
  }
}

class TypeScriptServerSession {
  private process?: ChildProcessWithoutNullStreams;
  private connection?: MessageConnection;
  private readonly versions = new Map<string, number>();
  private readonly diagnosticVersions = new Map<string, number>();
  private readonly diagnostics = new Map<string, LspDiagnostic[]>();
  private readonly opened = new Set<string>();

  constructor(private readonly workspaceRoot: string) {}

  async start(): Promise<void> {
    const command = resolveServerCommand(this.workspaceRoot);
    this.process = spawn(command, ["--stdio"], {
      cwd: this.workspaceRoot,
      shell: process.platform === "win32",
    });
    this.process.on("error", () => {
      // The request timeout turns startup failures into a non-fatal diagnostic notice.
    });
    this.connection = createMessageConnection(
      new StreamMessageReader(this.process.stdout),
      new StreamMessageWriter(this.process.stdin),
    );
    this.connection.onNotification(PublishDiagnosticsNotification.type, (params) => {
      this.diagnostics.set(params.uri, params.diagnostics.map(toLspDiagnostic));
      this.diagnosticVersions.set(params.uri, (this.diagnosticVersions.get(params.uri) ?? 0) + 1);
    });
    this.connection.listen();

    const rootUri = pathToFileURL(resolve(this.workspaceRoot)).toString();
    const params: InitializeParams = {
      processId: process.pid,
      rootUri,
      capabilities: {
        textDocument: {
          publishDiagnostics: {},
        },
        workspace: {
          configuration: true,
          workspaceFolders: true,
        },
      },
      workspaceFolders: [{
        uri: rootUri,
        name: this.workspaceRoot.split(/[\\/]/).pop() || "workspace",
      }],
    };

    await withTimeout(
      this.connection.sendRequest(InitializeRequest.type, params),
      DIAGNOSTIC_WAIT_MS,
      "TypeScript LSP initialization timed out.",
    );
    this.connection.sendNotification(InitializedNotification.type, {});
  }

  async syncFile(filePath: string, content: string): Promise<LspSyncResult> {
    if (!this.connection) return { diagnostics: [], notice: "Unavailable: server is not connected." };
    const fullPath = resolve(this.workspaceRoot, filePath);
    const uri = pathToFileURL(fullPath).toString();
    const version = (this.versions.get(uri) ?? 0) + 1;
    const diagnosticsVersion = this.diagnosticVersions.get(uri) ?? 0;
    this.versions.set(uri, version);

    if (this.opened.has(uri)) {
      this.connection.sendNotification(DidChangeTextDocumentNotification.type, {
        textDocument: { uri, version },
        contentChanges: [{ text: content }],
      });
    } else {
      this.opened.add(uri);
      this.connection.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: {
          uri,
          languageId: extname(filePath) === ".tsx" ? "typescriptreact" : "typescript",
          version,
          text: content,
        },
      });
    }

    const diagnostics = await waitForDiagnostics(
      () => this.diagnostics.get(uri),
      () => (this.diagnosticVersions.get(uri) ?? 0) > diagnosticsVersion,
    );
    return { diagnostics: diagnostics ?? [] };
  }

  dispose(): void {
    try {
      this.connection?.dispose();
    } catch {
      // best effort shutdown
    }
    try {
      this.process?.kill();
    } catch {
      // best effort shutdown
    }
  }
}

function resolveServerCommand(workspaceRoot: string): string {
  const workspaceBin = resolve(workspaceRoot, "node_modules", ".bin", process.platform === "win32" ? "typescript-language-server.cmd" : "typescript-language-server");
  const cwdBin = resolve(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "typescript-language-server.cmd" : "typescript-language-server");
  if (existsSync(workspaceBin)) return workspaceBin;
  return existsSync(cwdBin) ? cwdBin : "typescript-language-server";
}

async function waitForDiagnostics(
  read: () => LspDiagnostic[] | undefined,
  isFresh: () => boolean,
): Promise<LspDiagnostic[] | undefined> {
  const started = Date.now();
  while (Date.now() - started < DIAGNOSTIC_WAIT_MS) {
    await sleep(50);
    if (isFresh()) return read();
  }
  return read();
}

function formatDiagnostics(filePath: string, diagnostics: readonly LspDiagnostic[]): string {
  const lines = diagnostics.map((diagnostic) => {
    const source = diagnostic.source ? ` ${diagnostic.source}` : "";
    return `- ${diagnostic.severity}${source} ${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`;
  });
  return `LSP diagnostics for ${filePath}:\n${lines.join("\n")}`;
}

function toLspDiagnostic(diagnostic: Diagnostic): LspDiagnostic {
  return {
    severity: severityLabel(diagnostic.severity),
    line: diagnostic.range.start.line + 1,
    column: diagnostic.range.start.character + 1,
    message: typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value,
    ...(diagnostic.source ? { source: diagnostic.source } : {}),
  };
}

function severityLabel(severity?: DiagnosticSeverity): LspDiagnostic["severity"] {
  if (severity === DiagnosticSeverity.Warning) return "warning";
  if (severity === DiagnosticSeverity.Information) return "information";
  if (severity === DiagnosticSeverity.Hint) return "hint";
  return "error";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        rejectPromise(err);
      },
    );
  });
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined, message: string): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error(message));
  return new Promise((resolvePromise, rejectPromise) => {
    const abort = () => rejectPromise(new Error(message));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolvePromise(value);
      },
      (err: unknown) => {
        signal.removeEventListener("abort", abort);
        rejectPromise(err);
      },
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
