import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/api";
import { getAgentSystemPrompt, isStructuredAgent } from "@/lib/agent-prompts";
import { completeChat } from "@/lib/llm";
import type { AgentRole } from "@/lib/types";
import { jsonError, zodErrorResponse } from "@/lib/api-errors";

const agentBodySchema = z
  .object({
    agentRole: z.string().min(1).max(120),
    context: z.record(z.string(), z.any()),
    userMessage: z.string().max(8000).optional(),
    conversationHistory: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().max(8000),
        })
      )
      .max(40)
      .optional(),
    mode: z.enum(["structured", "line", "prose"]).optional(),
  })
  .strict();

function parseJson<T>(text: string): T | null {
  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { error: authError } = await requireRole("readonly");
  if (authError) return authError;

  try {
    const raw = await req.json();
    const parsed = agentBodySchema.safeParse(raw);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const { agentRole, context, userMessage, conversationHistory, mode } = parsed.data;
    const structured = isStructuredAgent(agentRole as AgentRole, mode);
    const system = getAgentSystemPrompt(agentRole as AgentRole, structured);

    const contextMsg = `Context JSON:\n${JSON.stringify(context, null, 2)}`;
    const messages: { role: "user" | "assistant"; content: string }[] = [];

    if (conversationHistory?.length) {
      messages.push(...conversationHistory);
    }

    if (userMessage) {
      messages.push({ role: "user", content: `${contextMsg}\n\nUser question: ${userMessage}` });
    } else {
      messages.push({ role: "user", content: contextMsg });
    }

    const { text, provider } = await completeChat({ system, messages });

    if (agentRole === "Risk Agent" && structured) {
      const flags = parseJson<unknown[]>(text);
      if (flags) return NextResponse.json({ flags, provider });
    }
    if (agentRole === "Build Agent" && structured) {
      const build = parseJson<object>(text);
      if (build) return NextResponse.json({ build, provider });
    }
    if (agentRole === "Dependency Agent" && structured) {
      const warnings = parseJson<unknown[]>(text);
      if (warnings) return NextResponse.json({ warnings, provider });
    }

    return NextResponse.json({ text, provider });
  } catch (err) {
    return jsonError(err, {
      publicMessage: "AI unavailable",
      status: 503,
      logLabel: "api/agent",
    });
  }
}
