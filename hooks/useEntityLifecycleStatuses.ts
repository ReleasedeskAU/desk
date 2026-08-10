"use client";

/**
 * Load an entity lifecycle config and expose status option lists for filters/forms.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { loadJsonEffect } from "@/lib/safe-fetch";
import {
  defaultEntityStatusLabel,
  enabledEntityStatusLabels,
  entityStatusFilterOptions,
  openEntityStatusLabels,
  type EntityLifecycleConfigLike,
  type EntityLifecycleStatusLike,
} from "@/lib/entity-lifecycle-status-ui";

type LifecycleApiPayload = {
  config: EntityLifecycleConfigLike;
};

export type UseEntityLifecycleStatusesResult = {
  config: EntityLifecycleConfigLike | null;
  /** Enabled labels for create/edit selects. */
  createOptions: string[];
  /** Enabled + Off-in-use labels for filters. */
  filterOptions: (presentOnData?: Iterable<string>) => string[];
  defaultStatus: string;
  openLabels: string[];
  statuses: EntityLifecycleStatusLike[];
};

/**
 * Fetch lifecycle statuses from a config API (e.g. /api/blocker-lifecycle-config).
 * @param apiPath - Authenticated GET that returns `{ config }`.
 * @param isOpen - Optional open/attention predicate (defaults to non-terminal).
 */
export function useEntityLifecycleStatuses(
  apiPath: string,
  isOpen?: (status: EntityLifecycleStatusLike) => boolean
): UseEntityLifecycleStatusesResult {
  const [config, setConfig] = useState<EntityLifecycleConfigLike | null>(null);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  useEffect(() => {
    return loadJsonEffect<LifecycleApiPayload>(
      apiPath,
      (payload) => setConfig(payload.config),
      { label: `lifecycle-statuses:${apiPath}` }
    );
  }, [apiPath]);

  return useMemo(() => {
    if (!config) {
      return {
        config: null,
        createOptions: [],
        filterOptions: (present = []) =>
          [...new Set([...present].map((s) => s.trim()).filter(Boolean))].sort(),
        defaultStatus: "",
        openLabels: [],
        statuses: [],
      };
    }
    return {
      config,
      createOptions: enabledEntityStatusLabels(config),
      filterOptions: (present = []) => entityStatusFilterOptions(config, present),
      defaultStatus: defaultEntityStatusLabel(config),
      openLabels: openEntityStatusLabels(config, isOpenRef.current),
      statuses: config.statuses,
    };
  }, [config]);
}
