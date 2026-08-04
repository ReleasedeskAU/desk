import { agents, connectors, releases, type SearchResult } from "./dummy-data";
import { buildEnvironmentDesk } from "./enterprise-env-data";
import { connectorSlug } from "./connectors";
import { searchSeedCatalog } from "./search-seed-catalog";

const deskSearchIndex = buildEnvironmentDesk(releases).versions.map((v) => ({
  application: v.application,
  team: v.team,
  prod: v.prod,
}));

const LOCAL_SEARCH_CAP = 24;

/**
 * Local GlobalSearch / voice search index (demo catalog + seed-data catalogs).
 * @param query - User search string.
 * @returns Deduped SearchResult rows (capped).
 */
export function searchAll(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: SearchResult[] = [];

  releases.forEach((r) => {
    if (
      r.version.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.team.toLowerCase().includes(q) ||
      r.owner.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q)
    ) {
      results.push({
        id: `rel-${r.id}`,
        type: "release",
        label: `${r.version} — ${r.name}`,
        sublabel: `${r.team} · ${r.status}`,
        href: `/releases/${r.id}`,
      });
    }

    r.tickets.forEach((t) => {
      if (t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)) {
        results.push({
          id: `tkt-${t.id}`,
          type: "ticket",
          label: t.id,
          sublabel: `${t.title} · ${r.version}`,
          href: `/releases/${r.id}`,
        });
      }
    });

    if (r.changeRecord && r.changeRecord.crNumber.toLowerCase().includes(q)) {
      results.push({
        id: `cr-${r.changeRecord.crNumber}`,
        type: "change",
        label: r.changeRecord.crNumber,
        sublabel: `${r.version} · ${r.changeRecord.riskTier} risk · CAB ${r.changeRecord.cabStatus}`,
        href: `/releases/${r.id}`,
      });
    }
  });

  agents.forEach((a) => {
    if (a.name.toLowerCase().includes(q) || a.tagline.toLowerCase().includes(q)) {
      results.push({
        id: `ag-${a.id}`,
        type: "ticket",
        label: a.name,
        sublabel: `${a.tagline} · Agent control room`,
        href: "/agents",
      });
    }
  });

  connectors.forEach((c) => {
    if (c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)) {
      results.push({
        id: `conn-${c.id}`,
        type: "ticket",
        label: c.name,
        sublabel: `${c.category} · ${c.status}`,
        href: `/connectors?filter=issues#${connectorSlug(c.name)}`,
      });
    }
  });

  if (
    q.includes("environment") ||
    q.includes("booking") ||
    q.includes("desk") ||
    q.includes("sap") ||
    q.includes("topology") ||
    q.includes("version matrix")
  ) {
    results.push({
      id: "env-desk",
      type: "environment",
      label: "Environment Desk",
      sublabel: "Timeline · booking · versions · topology",
      href: "/environments",
    });
  }

  deskSearchIndex.forEach((v) => {
    if (
      v.application.toLowerCase().includes(q) ||
      (v.team && v.team.toLowerCase().includes(q)) ||
      v.prod.toLowerCase().includes(q)
    ) {
      results.push({
        id: `env-app-${v.application}`,
        type: "version",
        label: `${v.application} — ${v.prod} in PROD`,
        sublabel: "Environment Desk · version matrix",
        href: "/environments",
      });
    }
  });

  // Seed-data catalogs (ENV-0001, RSK-001, …) — same coverage expansion as voice search_entity.
  results.push(...searchSeedCatalog(query, LOCAL_SEARCH_CAP));

  const seen = new Set<string>();
  return results
    .filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    })
    .slice(0, LOCAL_SEARCH_CAP);
}
