import { handleRemoveGrant } from "@/lib/release-scope-routes";

/**
 * Remove a draft change-request grant.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; requestId: string; grantId: string }> }
) {
  const { id, requestId, grantId } = await params;
  return handleRemoveGrant({ idParam: id, grantId, requestId });
}
