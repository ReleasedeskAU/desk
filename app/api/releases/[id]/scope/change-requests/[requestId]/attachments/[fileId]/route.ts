import { handleDownloadAttachment } from "@/lib/release-scope-routes";

/**
 * Download a change-request file after session tenant check.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; requestId: string; fileId: string }> }
) {
  const { id, requestId, fileId } = await params;
  return handleDownloadAttachment({ idParam: id, fileId, requestId });
}
