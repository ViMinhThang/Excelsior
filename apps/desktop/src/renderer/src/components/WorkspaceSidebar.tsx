import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderClosed,
  FolderOpen,
  Settings,
} from "lucide-react";
import type { WorkspaceTreeNode } from "../../../main/preload";

type WorkspaceSidebarProps = {
  openFolders: Record<string, boolean>;
  workspaceName: string;
  workspaceTree: WorkspaceTreeNode[];
  onOpenSettings: () => void;
  onSelectWorkspace: () => void;
  onToggleFolder: (path: string) => void;
};

type TreeNodeProps = {
  depth?: number;
  node: WorkspaceTreeNode;
  openFolders: Record<string, boolean>;
  onToggleFolder: (path: string) => void;
};

function TreeNode({ depth = 0, node, openFolders, onToggleFolder }: TreeNodeProps) {
  const isDirectory = node.type === "directory";
  const isOpen = openFolders[node.path] ?? false;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (isDirectory) onToggleFolder(node.path);
        }}
        className="group flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-brand-text-muted hover:bg-brand-panel hover:text-brand-text-strong"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        title={node.path}
      >
        {isDirectory ? (
          isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" />
        )}
        {isDirectory ? (
          <Folder className="h-4 w-4 shrink-0 text-brand-accent" />
        ) : (
          <File className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
      </button>

      {isDirectory && isOpen && (
        <div>
          {node.children?.map((child) => (
            <TreeNode
              key={child.path}
              depth={depth + 1}
              node={child}
              openFolders={openFolders}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkspaceSidebar({
  openFolders,
  workspaceName,
  workspaceTree,
  onOpenSettings,
  onSelectWorkspace,
  onToggleFolder,
}: WorkspaceSidebarProps) {
  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-r border-brand-border bg-brand-surface select-none">
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="flex h-9 items-center gap-2 bg-brand-bg px-3">
          <FolderOpen className="h-4.5 w-4.5 shrink-0 text-brand-accent" />
          <span className="truncate text-sm font-medium text-brand-text-strong">{workspaceName}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {workspaceTree.length > 0 ? (
            workspaceTree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                openFolders={openFolders}
                onToggleFolder={onToggleFolder}
              />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-brand-border px-3 py-5 text-center text-xs text-brand-text-muted">
              No files found.
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 border-t border-brand-border bg-brand-sidebar-footer p-4">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 text-xs font-medium text-brand-text-muted hover:bg-brand-panel hover:text-brand-text-strong"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
        <button
          type="button"
          onClick={onSelectWorkspace}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 text-xs font-medium text-brand-text-muted hover:bg-brand-panel hover:text-brand-text-strong"
        >
          <FolderClosed className="h-4 w-4" />
          Switch
        </button>
      </div>
    </aside>
  );
}
