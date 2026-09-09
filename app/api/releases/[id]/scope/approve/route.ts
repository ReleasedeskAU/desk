import { handleApproveScope } from "@/lib/release-scope-routes";

/**
 * First scope approve. No why. Locks description, due date, attachments, grants.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleApproveScope(req, id);
}
