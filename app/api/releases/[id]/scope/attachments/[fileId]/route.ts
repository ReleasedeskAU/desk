import { handleDownloadAttachment } from "@/lib/release-scope-routes";

/**
 * Download a scope file after session tenant check.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params;
  return handleDownloadAttachment({ idParam: id, fileId });
}
