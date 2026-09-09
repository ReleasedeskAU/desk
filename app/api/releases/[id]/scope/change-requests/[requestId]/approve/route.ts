import { handleApproveChangeRequest } from "@/lib/release-scope-routes";

/**
 * Approve a change request. Fails if why was not saved. No CAB / snapshot writes.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id, requestId } = await params;
  return handleApproveChangeRequest(req, id, requestId);
}
