/**
 * Map lifecycle editMode codes to plain-language labels for settings UI.
 *
 * @param editMode - Stored edit policy key (full, limited, read_only, immutable, …)
 * @returns User-facing phrase; unknown values returned unchanged
 */
export function lifecycleEditModeLabel(editMode: string): string {
  switch (editMode) {
    case "immutable":
      return "After this status: no further edits";
    case "read_only":
    case "read-only":
      return "View-only in this status";
    case "limited":
      return "Limited edits in this status";
    case "full":
      return "Editable in this status";
    default:
      return editMode;
  }
}
