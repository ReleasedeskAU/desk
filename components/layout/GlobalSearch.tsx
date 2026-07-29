"use client";

/**
 * ⌘K GlobalSearch — dashboard search bar.
 * Uses the same context-agent strengthening as voice (shorthand codes,
 * multi-term ranking) on top of local index + authenticated /api/search.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Package, Search, Sparkles, Ticket } from "lucide-react";
import { searchAll } from "@/lib/search";
import type { SearchResult } from "@/lib/dummy-data";
import { safeFetchJson, isFetchAbort } from "@/lib/safe-fetch";
import {
  rankSearchResults,
  strengthenSearchKeys,
} from "@/lib/search-strengthen";
import { retrieveVoiceContext } from "@/lib/voice/context-agent";

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

const icons: Record<string, typeof Package> = {
  release: Package,
  ticket: Ticket,
  change: FileText,
  template: Sparkles,
  booking: Package,
  risk: FileText,
  blocker: FileText,
  drift: FileText,
  approval: FileText,
  incident: FileText,
  conflict: FileText,
  dependency: FileText,
  leave: FileText,
  alert: FileText,
  maintenance: FileText,
  flow: FileText,
  application: Package,
  department: Package,
  user: Ticket,
  environment: Package,
  version: Package,
  "risk-factor": FileText,
  status: FileText,
};

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [apiResults, setApiResults] = useState<SearchResult[]>([]);
  const [interpreted, setInterpreted] = useState<string | null>(null);
  const [redirectHref, setRedirectHref] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const strengthened = useMemo(
    () => (query.trim().length >= 1 ? strengthenSearchKeys(query) : null),
    [query]
  );

  const localRanked = useMemo(() => {
    if (!strengthened) return [] as SearchResult[];
    const retrieved = retrieveVoiceContext(strengthened.plan, {
      searchFn: searchAll,
    });
    return retrieved.results;
  }, [strengthened]);

  const merged = useMemo(() => {
    if (!strengthened) return [] as SearchResult[];
    return rankSearchResults([...localRanked, ...apiResults], strengthened.plan, 16);
  }, [strengthened, localRanked, apiResults]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setApiResults([]);
      setInterpreted(null);
      setRedirectHref(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setApiResults([]);
      setInterpreted(null);
      setRedirectHref(null);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        const { interpreted: localInterpreted } = strengthenSearchKeys(q);
        const result = await safeFetchJson<{
          results?: SearchResult[];
          interpreted?: string;
          redirectHref?: string;
        }>(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ac.signal,
          label: "global-search",
        });
        if (ac.signal.aborted || isFetchAbort(result)) return;
        if (result.ok) {
          setApiResults(result.data.results ?? []);
          setInterpreted(
            result.data.interpreted ?? localInterpreted ?? null
          );
          setRedirectHref(result.data.redirectHref ?? null);
        }
      })();
    }, 200);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query]);

  if (!open) return null;

  const navigate = (href: string) => {
    router.push(href);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && redirectHref) {
                navigate(redirectHref);
              } else if (e.key === "Enter" && merged[0]) {
                navigate(merged[0].href);
              }
            }}
            placeholder='Try "release 75", "blocked payment", BLK-0010…'
            className="flex-1 text-sm outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden sm:inline text-xs text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {query.trim() === "" ? (
            <p className="p-4 text-sm text-slate-400">
              Search releases, blockers, risks, bookings, incidents, and more —
              try &ldquo;release 75&rdquo;, &ldquo;what&apos;s blocked in FIN&rdquo;, or a code.
            </p>
          ) : merged.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">
              No results for &ldquo;{query}&rdquo;
              {strengthened?.interpreted ? (
                <span className="block text-xs text-slate-400 mt-1">
                  {strengthened.interpreted}
                </span>
              ) : null}
            </p>
          ) : (
            <>
              {interpreted && (
                <p className="px-4 pt-3 pb-1 text-xs text-brand-600 font-medium">
                  {interpreted}
                </p>
              )}
              {merged.map((r) => {
                const Icon = r.id.startsWith("tpl-")
                  ? icons.template
                  : icons[r.type] ?? icons.change;
                return (
                  <button
                    key={`${r.id}-${r.href}`}
                    type="button"
                    onClick={() => navigate(r.href)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-50 last:border-0"
                  >
                    <Icon className="w-4 h-4 text-brand-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {r.label}
                      </p>
                      <p className="text-xs text-slate-400">{r.sublabel}</p>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
