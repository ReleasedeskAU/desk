/**
 * Retrieve + rank search hits for the voice context agent.
 * Uses local searchAll (+ optional API results), APP_CONTEXT boost, session memory.
 */

import { searchAll } from "@/lib/search";
import type { SearchResult } from "@/lib/dummy-data";
import { ENTITY_HREF_PREFIX } from "@/lib/search-entity-types";
import { getVoiceAppContext } from "@/lib/voice/app-context";
import {
  getVoiceSearchCache,
  setVoiceSearchCache,
  voiceSearchCacheKey,
} from "@/lib/voice/context-agent/cache";
import { resolveVoicePronoun } from "@/lib/voice/context-agent/session-memory";
import type { VoiceQueryPlan } from "@/lib/voice/context-agent/types";
import type {
  VoiceRetrieveOptions,
  VoiceRetrieveResult,
} from "@/lib/voice/context-agent/types";

const MAX_RESULTS = 14;

function filterByEntityType(
  results: SearchResult[],
  entityType: string | undefined
): SearchResult[] {
  if (!entityType?.trim()) return results;
  const t = entityType.trim().toLowerCase();
  const prefix = ENTITY_HREF_PREFIX[t];
  if (prefix) {
    return results.filter(
      (r) => r.href === prefix || r.href.startsWith(`${prefix}/`) || r.type === t
    );
  }
  return results.filter((r) => r.type === t || r.label.toLowerCase().includes(t));
}

function mergeResults(batches: SearchResult[][]): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const batch of batches) {
    for (const r of batch) {
      const key = `${r.href}|${r.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
      if (out.length >= MAX_RESULTS * 2) return out;
    }
  }
  return out;
}

/**
 * Score a hit against plan terms + primary query (higher = better).
 * @param r - Search row.
 * @param plan - Active plan.
 */
export function scoreVoiceSearchHit(r: SearchResult, plan: VoiceQueryPlan): number {
  const hay = `${r.label} ${r.sublabel ?? ""} ${r.id} ${r.href}`.toLowerCase();
  const primary = plan.primaryQuery.toLowerCase();
  let score = 0;

  if (primary && hay.includes(primary)) score += 20;
  // Exact business-code style in label
  if (/^[A-Z]{2,4}-\d{4}$/i.test(plan.primaryQuery) && hay.includes(primary)) {
    score += 40;
  }

  for (const term of plan.terms) {
    if (hay.includes(term)) score += term.length >= 4 ? 6 : 3;
  }

  // Prefer rows that match more terms
  if (plan.terms.length >= 2) {
    const matched = plan.terms.filter((t) => hay.includes(t)).length;
    score += matched * 4;
  }

  return score;
}

function boostFromAppContext(
  results: SearchResult[],
  plan: VoiceQueryPlan
): SearchResult[] {
  const ctx = getVoiceAppContext();
  if (!ctx?.visible.length) return results;
  if (plan.entityType && ctx.entityType && plan.entityType !== ctx.entityType) {
    return results;
  }

  const terms = [
    plan.primaryQuery.toLowerCase(),
    ...plan.terms.map((t) => t.toLowerCase()),
  ].filter(Boolean);

  const boosted: SearchResult[] = [];
  for (const row of ctx.visible) {
    const hay = `${row.code} ${row.label} ${row.path}`.toLowerCase();
    const hit =
      terms.length === 0
        ? false
        : terms.some((t) => t.length >= 2 && hay.includes(t));
    if (!hit) continue;
    boosted.push({
      id: `ctx-${row.code}`,
      type: ctx.entityType ?? "release",
      label: row.label,
      sublabel: "on screen",
      href: row.path,
    });
  }
  return mergeResults([boosted, results]);
}

function rememberedToResult(path: string, label: string, type: string, code: string): SearchResult {
  return {
    id: `mem-${code}`,
    type,
    label,
    sublabel: "recent in session",
    href: path,
  };
}

/**
 * Execute a voice query plan: memory → cache → multi-variant search → rank.
 * @param plan - From planVoiceContextQuery.
 * @param opts - Entity filter, search inject, API results.
 */
export function retrieveVoiceContext(
  plan: VoiceQueryPlan,
  opts: VoiceRetrieveOptions = {}
): VoiceRetrieveResult {
  const entityType = opts.entityType ?? plan.entityType;
  const searchFn = opts.searchFn ?? searchAll;

  if (plan.pronounRef) {
    const mem = resolveVoicePronoun(entityType);
    if (mem) {
      return {
        plan: { ...plan, entityType: plan.entityType },
        results: [
          rememberedToResult(mem.path, mem.label, mem.type, mem.code),
        ],
        fromMemory: true,
        cacheHit: false,
      };
    }
    return {
      plan,
      results: [],
      fromMemory: false,
      cacheHit: false,
    };
  }

  const cacheKey = voiceSearchCacheKey(
    plan.primaryQuery,
    entityType,
    plan.variants
  );
  const cached = getVoiceSearchCache(cacheKey);
  if (cached) {
    return {
      plan,
      results: filterByEntityType(cached, entityType).slice(0, MAX_RESULTS),
      fromMemory: false,
      cacheHit: true,
    };
  }

  const queries = [plan.primaryQuery, ...plan.variants].filter((q) => q.trim());
  const batches = queries.map((q) => searchFn(q));
  if (opts.apiResults?.length) batches.push(opts.apiResults);

  let merged = filterByEntityType(mergeResults(batches), entityType);
  merged = boostFromAppContext(merged, plan);

  merged.sort((a, b) => scoreVoiceSearchHit(b, plan) - scoreVoiceSearchHit(a, plan));
  // Drop zero-score noise when we had meaningful terms (keep primary hits)
  if (plan.terms.length > 0) {
    const scored = merged.filter((r) => scoreVoiceSearchHit(r, plan) > 0);
    if (scored.length > 0) merged = scored;
  }

  const results = merged.slice(0, MAX_RESULTS);
  setVoiceSearchCache(cacheKey, results);

  return {
    plan,
    results,
    fromMemory: false,
    cacheHit: false,
  };
}
