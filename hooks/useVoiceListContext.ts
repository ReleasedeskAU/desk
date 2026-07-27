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
 * @param entityType - Canonical search entity kind.
 * @param rows - Visible rows in display order.
 * @param note - Optional filter/sort hint.
 */
export function useVoiceListContext(
  page: string,
  entityType: SearchEntityType,
  rows: VoiceVisibleRow[],
  note?: string
): void {
  const signature = rows.map((r) => `${r.code}:${r.path}`).join("|");
  useEffect(() => {
    setVoiceAppContext({
      page,
      entityType,
      visible: rows,
      note,
    });
    return () => {
      setVoiceAppContext(null);
    };
    // signature stands in for rows content; rows read from latest closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [page, entityType, note, signature]);
}
