/**
 * Server-side Drift Type membership against ReferenceData (category=drift_type).
 */
import { prisma } from "@/lib/prisma";

/**
 * Reject a type that is missing or inactive in the lookup list.
 * @param value - Proposed driftType
 * @returns User-safe error, or null when valid
 */
export async function invalidDriftTypeMessage(
  value: string
): Promise<string | null> {
  const row = await prisma.referenceData.findUnique({
    where: { category_value: { category: "drift_type", value } },
  });
  if (!row || !row.active) {
    return "Invalid drift type — pick an active value from the Drift Type list.";
  }
  return null;
}
