"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import { AgentBadge } from "@/components/badges/AgentBadge";
import { AISkeleton } from "@/components/ui/AISkeleton";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { useChat } from "./ChatProvider";
import { parseCitations } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

const SEED: ChatMessage[] = [
  {
    role: "user",
    content: "What should I focus on in my Morning Inbox today, and can we ship anything blocked?",
  },
];

async function sendChatMessage(opts: {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  currentPath: string;
}): Promise<{ text?: string; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? "Chat unavailable" };
    return { text: data.text as string };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { error: "Request timed out — try a shorter question" };
    }
    return { error: "Chat request failed" };
  } finally {
    clearTimeout(timeout);
  }
}

export function ChatPanel() {
  const { open, setOpen, toggle } = useChat();
  const pathname = usePathname();
  const [messages, setMessages] = useState<ChatMessage[]>(SEED);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const ask = useCallback(
    async (userMessage: string, history: ChatMessage[]) => {
      setLoading(true);
      const res = await sendChatMessage({
        message: userMessage,
        history: history.map((m) => ({ role: m.role, content: m.content })),
        currentPath: pathname,
      });
      setLoading(false);
      if (res.text) {
        const { content, citations } = parseCitations(res.text.replace(/\*\*Sources:\*\*/i, "Sources:"));
        setMessages((m) => [...m, { role: "assistant", content, citations }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: res.error ?? "AI unavailable", citations: [] }]);
      }
    },
    [pathname]
  );

  useEffect(() => {
    if (open && !seeded && messages.length === 1) {
      setSeeded(true);
      void ask(messages[0].content, []);
    }
  }, [open, seeded, messages, ask]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    const newMessages: ChatMessage[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    await ask(userMsg, newMessages.slice(0, -1));
  };

  return (
    <>
      <button
        onClick={toggle}
        className="fixed bottom-6 right-6 w-14 h-14 bg-brand-500 text-white rounded-full shadow-lg dark:shadow-md flex items-center justify-center hover:bg-brand-600 transition-all z-50"
        aria-label={open ? "Close chat" : "Open ReleaseDesk Everywhere Conversation Agent"}
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>
      {open && (
        <div className="fixed top-0 right-0 z-40 flex h-full w-full max-w-md flex-col border-l border-gray-200/80 dark:border-[var(--border)] bg-white dark:bg-[var(--sidebar)] shadow-theme-md">
          <div className="p-4 border-b border-gray-200 dark:border-[var(--border)] flex items-center justify-between bg-brand-50/50 dark:bg-[var(--card)]">
            <div>
              <p className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand-500" />
                ReleaseDesk Everywhere Conversation Agent
              </p>
              <AgentBadge agent="Conversation Agent" className="mt-1" />
              <p className="text-[11px] text-gray-500 dark:text-white/50 mt-1">
                Full app context · OpenAI · Web search when needed
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 dark:text-white/50 hover:text-gray-600 dark:hover:text-white"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[92%] rounded-xl px-4 py-3 shadow-theme-sm ${
                    m.role === "user"
                      ? "bg-brand-500 text-white"
                      : "bg-brand-50/80 dark:bg-[var(--card)] border border-brand-100 dark:border-[var(--border)]"
                  }`}
                >
                  {m.role === "assistant" && <AgentBadge agent="Conversation Agent" className="mb-2" />}
                  {m.role === "user" ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                  ) : (
                    <ChatMessageContent content={m.content} />
                  )}
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {m.citations.map((c) => (
                        <span
                          key={c}
                          className="inline-block rounded-full bg-white/80 dark:bg-white/10 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:text-white/70"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="rounded-xl border border-brand-100 dark:border-[var(--border)] bg-brand-50/50 dark:bg-[var(--card)] p-4">
                <AISkeleton lines={4} />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="p-4 border-t border-gray-200 dark:border-[var(--border)] flex gap-2 bg-white/50 dark:bg-[var(--sidebar)]">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Ask about releases, conflicts, risks, or next steps…"
              className="flex-1 px-3 py-2.5 border border-gray-200 dark:border-[var(--border)] bg-white dark:bg-[var(--card)] text-gray-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 placeholder:text-gray-400 dark:placeholder:text-white/40"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="px-3 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
