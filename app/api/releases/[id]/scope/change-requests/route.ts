import { handleCreateChangeRequest } from "@/lib/release-scope-routes";

/**
 * Start the single draft scope-change request (after scope is approved).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleCreateChangeRequest(id);
}
