"use client";

/**
 * Publish the current table's visible rows to the voice app-context store.
 * Call from list pages whenever filtered/sorted rows change; clears on unmount.
 */
import { useEffect } from "react";
import type { SearchEntityType } from "@/lib/search-entity-types";
import {
  setVoiceAppContext,
  type VoiceVisibleRow,
} from "@/lib/voice/app-context";

/**
 * Keep voice [APP_CONTEXT] in sync with the rows shown on this list page.
 * @param page - Pathname (e.g. /releases).
 * @param entityType - Canonical search entity kind (or null for generic tables).
 * @param rows - Full filtered rows in display order (sample is capped inside the store).
 * @param note - Optional filter/sort hint.
 * @param totalCount - Optional override when rows is already a sample; defaults to rows.length.
 */
export function useVoiceListContext(
  page: string,
  entityType: SearchEntityType | null,
  rows: VoiceVisibleRow[],
  note?: string,
  totalCount?: number
): void {
  const signature = rows.map((r) => `${r.code}:${r.path}`).join("|");
  const resolvedTotal =
    typeof totalCount === "number" ? totalCount : rows.length;
  useEffect(() => {
    setVoiceAppContext({
      page,
      entityType,
      visible: rows,
      totalCount: resolvedTotal,
      note,
    });
    return () => {
      setVoiceAppContext(null);
    };
    // signature stands in for rows content; rows read from latest closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [page, entityType, note, signature, resolvedTotal]);
}
