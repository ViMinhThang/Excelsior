import fs from "node:fs/promises";
import path from "node:path";
import type { ToolContext } from "../core/context.js";
import { createUnifiedDiff, type DiffAction } from "../../../diff/unifiedDiff.js";
import { authorizeToolAction } from "../core/policy.js";
import {
  isWorkspacePath,
  resolveToolPath,
} from "../core/workspace.js";

type FileChangeToolName = "writeFile" | "editFile";

interface PreparedFileChange {
  before: string;
  after: string;
  action: DiffAction;
}

interface ApplyFileChangeInput {
  ctx?: ToolContext;
  filePath: string;
  toolName: FileChangeToolName;
  errorAction: "writing" | "editing";
  diffMode: "always" | "when-confirming";
  prepare(fullPath: string, shouldBuildDiff: boolean): Promise<PreparedFileChange>;
  beforeWrite?(fullPath: string): Promise<void>;
  success(diffOutput: string): string;
}

class FileChangeUserError extends Error {}

export function fileChangeUserError(message: string): Error {
  return new FileChangeUserError(message);
}

type WritablePathResolution =
  | { allowed: true; fullPath: string }
  | { allowed: false; message: string };

async function resolveWritablePath(
  ctx: ToolContext | undefined,
  filePath: string,
  toolName: FileChangeToolName,
  errorAction: "writing" | "editing",
): Promise<WritablePathResolution> {
  const fullPath = resolveToolPath(filePath, ctx);
  if (isWorkspacePath(filePath, ctx)) return { allowed: true, fullPath };

  if (!ctx?.confirm || ctx.confirm.getListenerCount() === 0) {
    return {
      allowed: false,
      message: formatError(errorAction, new Error(`Path is outside the workspace: ${filePath}`)),
    };
  }

  const approved = await ctx.confirm.request(
    toolName,
    JSON.stringify({ filePath, outsideWorkspace: true }),
    {
      action: "warning",
      filePath,
    },
  );
  if (!approved) return { allowed: false, message: "Denied by user." };

  return { allowed: true, fullPath };
}

export async function applyFileChange({
  ctx,
  filePath,
  toolName,
  errorAction,
  diffMode,
  prepare,
  beforeWrite,
  success,
}: ApplyFileChangeInput): Promise<string> {
  const authorization = await authorizeToolAction(ctx, {
    toolName,
    capability: "fs:write",
    modePolicy: "write",
  });
  if (!authorization.allowed) return authorization.message;

  const pathResolution = await resolveWritablePath(ctx, filePath, toolName, errorAction);
  if (!pathResolution.allowed) return pathResolution.message;
  const { fullPath } = pathResolution;

  const shouldBuildDiff =
    diffMode === "always" ||
    Boolean(ctx?.confirm && ctx.confirm.getListenerCount() > 0);

  let change: PreparedFileChange;
  try {
    change = await prepare(fullPath, shouldBuildDiff);
  } catch (error: unknown) {
    if (error instanceof FileChangeUserError) return error.message;
    return formatError(errorAction, error);
  }

  const diffOutput = shouldBuildDiff
    ? createUnifiedDiff(filePath, change.before, change.after)
    : "";

  if (shouldBuildDiff) {
    const confirmation = await authorizeToolAction(ctx, {
      toolName,
      capability: "fs:write",
      modePolicy: "write",
      confirmation: {
        toolName,
        args: JSON.stringify({ filePath }),
        metadata: {
          action: change.action,
          filePath,
          diff: diffOutput,
        },
      },
    });
    if (!confirmation.allowed) return confirmation.message;
  }

  try {
    await ctx?.revert?.captureBeforeWrite(filePath, fullPath);
    await beforeWrite?.(fullPath);
    await fs.writeFile(fullPath, change.after, "utf-8");
    ctx?.revert?.recordWrite(filePath, fullPath, change.after);
    return success(diffOutput);
  } catch (error: unknown) {
    return formatError(errorAction, error);
  }
}

export async function prepareWriteChange(
  fullPath: string,
  content: string,
  shouldBuildDiff: boolean,
): Promise<PreparedFileChange> {
  if (!shouldBuildDiff) {
    return { before: "", after: content, action: "create" };
  }

  try {
    return {
      before: await fs.readFile(fullPath, "utf-8"),
      after: content,
      action: "overwrite",
    };
  } catch {
    return { before: "", after: content, action: "create" };
  }
}

export async function ensureParentDirectory(fullPath: string): Promise<void> {
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
}

function formatError(action: "writing" | "editing", error: unknown): string {
  return `Error ${action} file: ${
    error instanceof Error ? error.message : String(error)
  }`;
}
