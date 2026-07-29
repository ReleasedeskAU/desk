/**
 * Shared search strengthening for ⌘K GlobalSearch and /api/search.
 * Reuses the voice context-agent planner (shorthand + multi-term keys) without
 * dumping the DB into the LLM.
 */

import type { SearchResult } from "@/lib/dummy-data";
import {
  planVoiceContextQuery,
  scoreVoiceSearchHit,
  type VoiceQueryPlan,
} from "@/lib/voice/context-agent";

/**
 * Build DB/search keys from a human query (raw + normalized code + terms).
 * @param raw - Typed or spoken query.
 */
export function strengthenSearchKeys(raw: string): {
  plan: VoiceQueryPlan;
  keys: string[];
  interpreted: string | null;
} {
  const plan = planVoiceContextQuery(raw);
  const keys: string[] = [];
  const push = (k: string) => {
    const t = k.trim();
    if (t.length < 2) return;
    if (!keys.some((x) => x.toLowerCase() === t.toLowerCase())) keys.push(t);
  };
  push(raw);
  push(plan.primaryQuery);
  for (const t of plan.terms) push(t);
  for (const v of plan.variants.slice(0, 3)) push(v);

  let interpreted: string | null = null;
  if (
    plan.primaryQuery &&
    plan.primaryQuery.toLowerCase() !== raw.trim().toLowerCase() &&
    /^[A-Z]{2,4}-\d{4}$/i.test(plan.primaryQuery)
  ) {
    interpreted = `Understood as ${plan.primaryQuery}`;
  } else if (plan.terms.length >= 2) {
    interpreted = `Matching: ${plan.terms.slice(0, 4).join(" · ")}`;
  }

  return { plan, keys: keys.slice(0, 6), interpreted };
}

/**
 * Prisma `contains` OR clauses for a string field across strengthened keys.
 * @param field - Prisma scalar field name.
 * @param keys - From strengthenSearchKeys.
 */
export function containsAnyKey(
  field: string,
  keys: string[]
): Array<Record<string, { contains: string }>> {
  return keys.map((k) => ({ [field]: { contains: k } }));
}

/**
 * Rank and dedupe search hits (⌘K + API).
 * @param results - Unordered hits.
 * @param plan - Query plan for scoring.
 * @param limit - Max rows.
 */
export function rankSearchResults(
  results: SearchResult[],
  plan: VoiceQueryPlan,
  limit = 20
): SearchResult[] {
  const seen = new Set<string>();
  const deduped = results.filter((r) => {
    const key = `${r.href}|${r.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort(
    (a, b) => scoreVoiceSearchHit(b, plan) - scoreVoiceSearchHit(a, plan)
  );
  return deduped.slice(0, limit);
}
