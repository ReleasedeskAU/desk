import { handleAddGrant } from "@/lib/release-scope-routes";

/**
 * Grant an existing same-tenant user edit access to still-draft scope.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleAddGrant(req, id);
}
