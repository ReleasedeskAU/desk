import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/api";
import { buildConversationContext } from "@/lib/conversation-context";
import { runConversationAgent } from "@/lib/conversation-agent";
import { jsonError, zodErrorResponse } from "@/lib/api-errors";

const chatBodySchema = z
  .object({
    message: z.string().trim().min(1).max(8000),
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().max(8000),
        })
      )
      .max(40)
      .optional(),
    currentPath: z.string().max(500).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const { user, error } = await requireRole("readonly");
  if (error) return error;

  try {
    const parsed = chatBodySchema.safeParse(await req.json());
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const { message, history, currentPath } = parsed.data;
    const context = await buildConversationContext(
      user?.name ?? "",
      currentPath,
      user?.id
    );
    const { text, provider } = await runConversationAgent({
      context,
      userMessage: message,
      history: history ?? [],
    });

    return NextResponse.json({ text, provider });
  } catch (err) {
    return jsonError(err, {
      publicMessage: "Chat unavailable",
      status: 503,
      logLabel: "api/chat",
    });
  }
}
