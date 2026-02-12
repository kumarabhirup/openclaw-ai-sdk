"use client";

import { FileManagerTree, type TreeNode } from "./file-manager-tree";

type WorkspaceSidebarProps = {
  tree: TreeNode[];
  activePath: string | null;
  onSelect: (node: TreeNode) => void;
  onRefresh: () => void;
  orgName?: string;
  loading?: boolean;
};

function WorkspaceLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
    </svg>
  );
}

export function WorkspaceSidebar({
  tree,
  activePath,
  onSelect,
  onRefresh,
  orgName,
  loading,
}: WorkspaceSidebarProps) {
  return (
    <aside
      className="flex flex-col h-screen border-r flex-shrink-0"
      style={{
        width: "260px",
        background: "var(--color-surface)",
        borderColor: "var(--color-border)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-3 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <span style={{ color: "var(--color-accent)" }}>
          <WorkspaceLogo />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: "var(--color-text)" }}>
            {orgName || "Workspace"}
          </div>
          <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Dench CRM
          </div>
        </div>
      </div>

      {/* Section label */}
      <div
        className="px-4 pt-4 pb-1 text-[11px] font-medium uppercase tracking-wider"
        style={{ color: "var(--color-text-muted)" }}
      >
        Knowledge
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div
              className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{
                borderColor: "var(--color-border)",
                borderTopColor: "var(--color-accent)",
              }}
            />
          </div>
        ) : (
          <FileManagerTree
            tree={tree}
            activePath={activePath}
            onSelect={onSelect}
            onRefresh={onRefresh}
          />
        )}
      </div>

      {/* Footer */}
      <div
        className="px-3 py-2.5 border-t"
        style={{ borderColor: "var(--color-border)" }}
      >
        <a
          href="/"
          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors"
          style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              "var(--color-surface-hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          <BackIcon />
          Back to Chat
        </a>
      </div>
    </aside>
  );
}
