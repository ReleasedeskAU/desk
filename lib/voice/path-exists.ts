/**
 * Detail-path existence checks for navigate_to.
 * Allowlist only proves shape; this rejects hallucinated / missing entities
 * before router.push (avoids silent ok → page-not-found).
 */
import { releases } from "@/lib/dummy-data";
import {
  seedBookingCodeExists,
  seedReleaseCodeExists,
} from "@/lib/search-seed-catalog";

/** Invented codes models often emit — reject unless present in seed catalog. */
const HALLUCINATED_RELEASE_CODE = /^REL-\d+$/i;

type DetailChecker = {
  /** Match allowlisted detail path; capture group 1 = entity id. */
  re: RegExp;
  /** API to probe when not found in the local synthetic catalog. */
  apiPath: (id: string) => string;
  /** Optional sync check (demo/synthetic seed). */
  localExists?: (id: string) => boolean;
};

const DETAIL_CHECKERS: readonly DetailChecker[] = [
  {
    re: /^\/releases\/([^/]+)(?:\/dependencies)?$/,
    apiPath: (id) => `/api/releases/${encodeURIComponent(id)}`,
    localExists: (id) =>
      releases.some((r) => r.id === id) || seedReleaseCodeExists(id),
  },
  {
    re: /^\/risks\/([^/]+)$/,
    apiPath: (id) => `/api/risks/${encodeURIComponent(id)}`,
  },
  {
    re: /^\/drifts\/([^/]+)$/,
    apiPath: (id) => `/api/drifts/${encodeURIComponent(id)}`,
  },
  {
    re: /^\/blockers\/([^/]+)$/,
    apiPath: (id) => `/api/blockers/${encodeURIComponent(id)}`,
  },
  {
    re: /^\/conflicts\/([^/]+)$/,
    apiPath: (id) => `/api/conflicts/${encodeURIComponent(id)}`,
  },
  {
    re: /^\/approvals\/([^/]+)$/,
    apiPath: (id) => `/api/approvals/${encodeURIComponent(id)}`,
  },
  {
    re: /^\/leaves\/([^/]+)$/,
    apiPath: (id) => `/api/leaves/${encodeURIComponent(id)}`,
  },
  {
    re: /^\/incidents\/([^/]+)$/,
    apiPath: (id) => `/api/incidents/${encodeURIComponent(id)}`,
  },
  {
    re: /^\/monitoring-alerts\/([^/]+)$/,
    apiPath: (id) => `/api/monitoring-alerts/${encodeURIComponent(id)}`,
  },
  {
    re: /^\/planned-maintenance\/([^/]+)$/,
    apiPath: (id) => `/api/planned-maintenance/${encodeURIComponent(id)}`,
  },
  {
    re: /^\/dependencies\/([^/]+)$/,
    apiPath: (id) => `/api/dependencies/${encodeURIComponent(id)}`,
  },
  {
    re: /^\/integration-flows\/([^/]+)$/,
    apiPath: (id) => `/api/integration-flows/${encodeURIComponent(id)}`,
  },
  {
    re: /^\/booking\/([^/]+)$/,
    apiPath: (id) => `/api/bookings/${encodeURIComponent(id)}`,
    localExists: (id) => seedBookingCodeExists(id),
  },
  {
    re: /^\/environments\/versions\/([^/]+)$/,
    apiPath: (id) => `/api/environment-versions/${encodeURIComponent(id)}`,
  },
];

export type PathExistsResult =
  | { ok: true }
  | { ok: false; reason: string };

export type PathExistsDeps = {
  /** Injectable fetch for tests (defaults to global fetch). */
  fetch?: typeof fetch;
};

/**
 * Confirm a detail path targets a real entity (or is a non-detail page).
 * List/hub paths skip the existence probe.
 * @param path - Normalized allowlisted pathname.
 * @param deps - Optional fetch override.
 */
export async function assertVoicePathExists(
  path: string,
  deps: PathExistsDeps = {}
): Promise<PathExistsResult> {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  for (const checker of DETAIL_CHECKERS) {
    const m = checker.re.exec(path);
    if (!m) continue;
    const id = m[1] ?? "";
    if (!id) {
      return { ok: false, reason: "Missing entity id in path" };
    }
    // Structural reject: invented REL-* unless it is a real seed release code.
    if (
      HALLUCINATED_RELEASE_CODE.test(id) &&
      !seedReleaseCodeExists(id) &&
      !releases.some((r) => r.id === id)
    ) {
      return {
        ok: false,
        reason:
          "That release id is not valid — call search_entity and navigate_to with the returned path field",
      };
    }
    if (checker.localExists?.(id)) {
      return { ok: true };
    }
    if (typeof fetchFn !== "function") {
      return {
        ok: false,
        reason: `Entity not found in local catalog (${id})`,
      };
    }
    try {
      const res = await fetchFn(checker.apiPath(id), {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.ok) return { ok: true };
      return {
        ok: false,
        reason: `No entity at ${path} (${res.status})`,
      };
    } catch {
      return {
        ok: false,
        reason: `Could not verify entity at ${path}`,
      };
    }
  }
  // Non-detail allowlisted path (list/hub) — page exists as a route.
  return { ok: true };
}
