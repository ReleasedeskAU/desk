import { StatusBadge } from "@/components/badges/StatusBadge";
import { ASK_GROUNDING_SEARCH } from "@/lib/staffless/ask-copy";
import type { AskGrounding } from "@/lib/staffless/ask-grounding";
import { cn } from "@/lib/utils";

/**
 * Subtle trust chip for an Ask answer. Reuses StatusBadge for Verified.
 * Search uses the same gray token as Draft / N/A so contrast matches the system.
 */
export function AskGroundingBadge({ kind }: { kind: AskGrounding }) {
  if (kind === "verified") return <StatusBadge status="Verified" />;
  if (kind === "search") return <SearchChip />;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusBadge status="Verified" />
      <SearchChip />
    </span>
  );
}

function SearchChip() {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-theme-xs font-medium",
        "bg-gray-100 text-gray-600"
      )}
    >
      {ASK_GROUNDING_SEARCH}
    </span>
  );
}
