/**
 * Production-safe client fetch helpers.
 *
 * Why this exists:
 * - Raw `fetch().then(...)` without `.catch()` becomes an unhandled rejection
 *   when the network drops, the tab navigates away, or Turbopack/HMR aborts
 *   an in-flight request ("TypeError: Failed to fetch").
 * - A single helper keeps abort, JSON parsing, HTTP status, and logging
 *   consistent across pages — safer than sprinkling ad-hoc `.catch` calls.
 *
 * Security notes:
 * - Never surface raw stack traces, connection strings, or auth tokens in UI.
 * - Logs stay in the browser console (dev) / can be wired to a sink later.
 * - Credentials default to "same-origin" (cookies for Clerk session).
 */

export type SafeFetchErrorCode =
  | "aborted"
  | "network"
  | "http"
  | "parse"
  | "unknown";

export type SafeFetchOk<T> = {
  ok: true;
  data: T;
  status: number;
  /** Response headers when available (e.g. UX notice channel). */
  headers?: Headers;
};

export type SafeFetchErr = {
  ok: false;
  error: string;
  code: SafeFetchErrorCode;
  status?: number;
};

export type SafeFetchResult<T> = SafeFetchOk<T> | SafeFetchErr;

export type SafeFetchOptions = RequestInit & {
  /** Optional label for console warnings (e.g. "releases-list"). */
  label?: string;
  /**
   * When true (default), non-2xx responses are treated as errors.
   * Set false if the caller wants to inspect status itself via a custom parser.
   */
  rejectHttpErrors?: boolean;
};

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as { name: string }).name === "AbortError")
  );
}

function logFailure(label: string | undefined, code: SafeFetchErrorCode, detail: string) {
  const prefix = label ? `[safeFetch:${label}]` : "[safeFetch]";
  // Keep messages short — no response bodies that might contain PII.
  console.warn(prefix, code, detail);
}

/**
 * Fetch JSON with full error containment.
 * Never throws for network / HTTP / parse failures — returns a Result instead.
 * AbortError is returned as `{ ok: false, code: "aborted" }` (callers should ignore).
 */
export async function safeFetchJson<T = unknown>(
  input: RequestInfo | URL,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult<T>> {
  const { label, rejectHttpErrors = true, ...init } = options;

  try {
    const res = await fetch(input, {
      credentials: init.credentials ?? "same-origin",
      ...init,
    });

    if (rejectHttpErrors && !res.ok) {
      logFailure(label, "http", `${res.status} ${res.statusText}`);
      return {
        ok: false,
        code: "http",
        status: res.status,
        error: `Request failed (${res.status})`,
      };
    }

    // Empty body is valid for some endpoints — treat as null.
    const text = await res.text();
    if (!text) {
      return { ok: true, data: null as T, status: res.status, headers: res.headers };
    }

    try {
      return {
        ok: true,
        data: JSON.parse(text) as T,
        status: res.status,
        headers: res.headers,
      };
    } catch {
      logFailure(label, "parse", "invalid JSON");
      return { ok: false, code: "parse", status: res.status, error: "Invalid server response" };
    }
  } catch (err) {
    if (isAbortError(err) || options.signal?.aborted) {
      return { ok: false, code: "aborted", error: "Request aborted" };
    }
    const message = err instanceof Error ? err.message : "Network error";
    logFailure(label, "network", message);
    return { ok: false, code: "network", error: "Failed to reach server" };
  }
}

/**
 * Fire-and-forget JSON GET for useEffect loaders.
 * - Aborts automatically on cleanup
 * - Ignores abort / unmount races
 * - Invokes `onData` only on success
 * - Invokes optional `onError` for real failures (never for abort)
 *
 * @returns cleanup function for useEffect
 */
export function loadJsonEffect<T>(
  url: string,
  onData: (data: T) => void,
  options?: {
    label?: string;
    onError?: (error: string, code: SafeFetchErrorCode) => void;
    onFinally?: () => void;
    init?: RequestInit;
  }
): () => void {
  const ac = new AbortController();
  const label = options?.label;
  let settled = false;

  void (async () => {
    const result = await safeFetchJson<T>(url, {
      ...options?.init,
      signal: ac.signal,
      label,
    });

    // Abort / unmount: never touch React state (avoids "update before mount" races).
    if (ac.signal.aborted || (!result.ok && result.code === "aborted")) return;

    settled = true;
    // Defer past the current commit so parent setState is never applied mid-render.
    queueMicrotask(() => {
      if (ac.signal.aborted) return;
      if (result.ok) {
        onData(result.data);
      } else if (options?.onError) {
        options.onError(result.error, result.code);
      }
      options?.onFinally?.();
    });
  })();

  return () => {
    ac.abort();
    // If the request already finished but the microtask has not run, onFinally
    // must not fire against an unmounted tree — abort flag covers that.
    void settled;
  };
}

/** True when a SafeFetchResult should be ignored (unmount / navigation). */
export function isFetchAbort(result: SafeFetchResult<unknown>): boolean {
  return !result.ok && result.code === "aborted";
}
