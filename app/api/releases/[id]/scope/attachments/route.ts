import { handleAddScopeAttachment } from "@/lib/release-scope-routes";

/**
 * Append a PDF / Word / email file to draft scope. No replace or delete.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleAddScopeAttachment(req, id);
}
