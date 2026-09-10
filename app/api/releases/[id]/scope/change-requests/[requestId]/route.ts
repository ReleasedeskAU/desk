import { handlePatchChangeRequest } from "@/lib/release-scope-routes";

/**
 * Edit draft change-request text or why. Does not write scopeDescription.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id, requestId } = await params;
  return handlePatchChangeRequest(req, id, requestId);
}
