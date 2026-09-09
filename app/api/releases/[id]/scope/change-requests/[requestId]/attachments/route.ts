import { handleAddRequestAttachment } from "@/lib/release-scope-routes";

/**
 * Append a file to a draft change request. Files stay on the request.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id, requestId } = await params;
  return handleAddRequestAttachment(req, id, requestId);
}
