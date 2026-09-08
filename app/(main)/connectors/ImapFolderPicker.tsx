"use client";

import { Loader2, RefreshCw } from "lucide-react";
import type { ImapFolderOption } from "@/lib/imap/mailboxes";

export function ImapFolderPicker({
  folders,
  loading,
  error,
  filter,
  onFilter,
  selectedNames,
  onToggleFolder,
  onReload,
  canReload,
}: {
  folders: ImapFolderOption[];
  loading: boolean;
  error: string | null;
  filter: string;
  onFilter: (value: string) => void;
  selectedNames: string[];
  onToggleFolder: (name: string, checked: boolean) => void;
  onReload: () => void;
  canReload: boolean;
}) {
  const visible = folders.filter((folder) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return folder.name.toLowerCase().includes(q);
  });
  const selectedNotInList = selectedNames.filter((name) => !folders.some((f) => f.name === name));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Which folders should we copy?</h3>
        <button
          type="button"
          onClick={onReload}
          disabled={!canReload || loading}
          className="flex items-center gap-1 text-xs font-semibold text-[#2548C9] hover:underline disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Load folders
        </button>
      </div>
      <p className="text-xs text-gray-600">
        Pick specific folders. There is no “entire inbox” option — StaffLess will only read the folders you check.
      </p>
      <input
        value={filter}
        onChange={(e) => onFilter(e.target.value)}
        placeholder="Search folders"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Asking the mailbox for its folder list…</p>}
      {!loading && (
        <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 divide-y">
          {visible.length === 0 && selectedNotInList.length === 0 ? (
            <p className="px-3 py-4 text-sm text-gray-500">No folders loaded yet. Click Load folders.</p>
          ) : (
            <>
              {visible.map((folder) => (
                <label key={folder.name} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedNames.includes(folder.name)}
                    onChange={(e) => onToggleFolder(folder.name, e.target.checked)}
                  />
                  <span className="font-semibold">{folder.name}</span>
                  {/draft|junk|trash|spam/i.test(folder.name) ? (
                    <span className="text-xs text-amber-800">Usually personal or junk — only check if you mean to</span>
                  ) : null}
                </label>
              ))}
              {selectedNotInList.map((name) => (
                <label key={name} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50">
                  <input type="checkbox" checked onChange={(e) => onToggleFolder(name, e.target.checked)} />
                  <span className="font-semibold">{name}</span>
                  <span className="text-gray-500">Already saved on this connector</span>
                </label>
              ))}
            </>
          )}
        </div>
      )}
      {selectedNames.length > 0 && <p className="text-xs text-gray-500">{selectedNames.length} selected</p>}
    </div>
  );
}
