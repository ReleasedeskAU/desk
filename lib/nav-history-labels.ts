import { NAV_ITEMS } from "@/lib/navigation";
import { getPageDocumentation, resolvePageDocKey } from "@/lib/page-documentation";
import { resolvePageGuide } from "@/lib/page-guide";
import { releases as syntheticReleases } from "@/lib/dummy-data";

const RELEASE_DETAIL_RE = /^\/releases\/([^/]+)$/;
const RELEASE_DEPS_RE = /^\/releases\/([^/]+)\/dependencies$/;

function humanizeSegment(segment: string): string {
  return decodeURIComponent(segment)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Resolve a human-readable crumb label for a pathname (no query). */
export function resolveNavHistoryLabel(pathname: string): string {
  const exactNav = NAV_ITEMS.find((item) => item.href === pathname);
  if (exactNav) return exactNav.label;

  if (RELEASE_DEPS_RE.test(pathname)) return "Dependencies";

  const detailMatch = pathname.match(RELEASE_DETAIL_RE);
  if (detailMatch) {
    const id = detailMatch[1];
    const syn = syntheticReleases.find((r) => r.id === id);
    if (syn) return syn.version;
    // DB releases register a better label via setTrailLabel once loaded
    if (/^REL-/i.test(id)) return id.toUpperCase();
    return "Release";
  }

  const docKey = resolvePageDocKey(pathname);
  if (docKey) {
    const doc = getPageDocumentation(docKey);
    if (doc?.title) return doc.title;
  }

  const guide = resolvePageGuide(pathname);
  if (guide?.title) return guide.title;

  const longestNav = [...NAV_ITEMS]
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (longestNav && longestNav.href !== "/") return longestNav.label;

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "Home";
  return humanizeSegment(parts[parts.length - 1]!);
}
