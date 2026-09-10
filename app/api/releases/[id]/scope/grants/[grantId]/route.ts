import { handleRemoveGrant } from "@/lib/release-scope-routes";

/**
 * Remove a draft-scope grant.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; grantId: string }> }
) {
  const { id, grantId } = await params;
  return handleRemoveGrant({ idParam: id, grantId });
}
