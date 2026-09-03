import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { lookupReleaseByCode } from "@/lib/conversation-context";
import { searchWeb } from "@/lib/web-search";

const CONVERSATION_SYSTEM = `You are the ReleaseDesk Everywhere Conversation Agent — an expert release management copilot for the ReleaseDesk Everywhere application.

You have JSON context with live portfolio data from PostgreSQL (releases, P1 issues, conflicts, risks, approvals, connectors, navigation tabs).

Rules:
- Ground answers in the provided context and tool results. Never invent release codes, ticket IDs, or counts.
- When the user asks for help, give actionable recommendations (who should act, what to check, which page to open).
- Format responses in clean Markdown: use **bold** for emphasis, bullet lists for steps, ### for section headings when helpful.
- Keep answers focused but complete (3–8 short paragraphs or lists unless the user asks for brevity).
- Reference release codes and paths like /releases, /inbox, /conflicts when relevant.
- End every response with a short "**Sources:**" line listing 2–4 specific data points used (release codes, counts, page names).
- Use search_web only for external/industry questions (CVEs, ITIL, best practices) — not for data already in context.
- Use lookup_release when the user asks about a specific release code.`;

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the public internet for current external information (standards, CVEs, vendor docs, best practices).",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search query" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_release",
      description: "Fetch full details for a workbook release by code (e.g. REL-0042).",
      parameters: {
        type: "object",
        properties: { releaseCode: { type: "string", description: "Release code like REL-0042" } },
        required: ["releaseCode"],
      },
    },
  },
];

async function runTool(name: string, args: Record<string, string>): Promise<string> {
  if (name === "search_web") return searchWeb(args.query ?? "");
  if (name === "lookup_release") {
    const detail = await lookupReleaseByCode(args.releaseCode ?? "");
    return detail ? JSON.stringify(detail, null, 2) : `No release found for code "${args.releaseCode}".`;
  }
  return "Unknown tool.";
}

export async function runConversationAgent(opts: {
  context: object;
  userMessage: string;
  history: { role: "user" | "assistant"; content: string }[];
}): Promise<{ text: string; provider: "openai" }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured. Add it to .env.local");
  }

  const openai = new OpenAI({ apiKey });
  const contextBlock = `Application context (JSON):\n${JSON.stringify(opts.context)}`;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: CONVERSATION_SYSTEM },
    ...opts.history.slice(-8).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    {
      role: "user",
      content: `${contextBlock}\n\nUser question: ${opts.userMessage}`,
    },
  ];

  for (let round = 0; round < 4; round++) {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.35,
      max_tokens: 1800,
    });

    const choice = res.choices[0]?.message;
    if (!choice) throw new Error("Empty response from OpenAI");

    if (!choice.tool_calls?.length) {
      return { text: choice.content?.trim() ?? "", provider: "openai" };
    }

    messages.push(choice);
    for (const call of choice.tool_calls) {
      if (call.type !== "function") continue;
      let parsed: Record<string, string> = {};
      try {
        parsed = JSON.parse(call.function.arguments || "{}") as Record<string, string>;
      } catch {
        parsed = {};
      }
      const output = await runTool(call.function.name, parsed);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: output,
      });
    }
  }

  throw new Error("Conversation agent exceeded tool rounds");
}
