import { handleAddGrant } from "@/lib/release-scope-routes";

/**
 * Grant edit access on a still-draft change request (does not carry from scope).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id, requestId } = await params;
  return handleAddGrant(req, id, requestId);
}
