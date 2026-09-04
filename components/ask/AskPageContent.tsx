"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import Link from "next/link";
import { Loader2, Send, SquarePen } from "lucide-react";
import { AISkeleton } from "@/components/ui/AISkeleton";
import { AskMarkdown } from "@/components/ask/AskMarkdown";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import {
  ASK_EMPTY_BODY,
  ASK_EMPTY_HINT,
  ASK_EMPTY_TITLE,
  ASK_EXAMPLE_PROMPTS,
  ASK_LIMITED_INDEX_HINT,
  ASK_PAGE_SUBTITLE,
  ASK_PAGE_TITLE,
  ASK_PUBLIC_UNAVAILABLE,
  ASK_SEARCHING_LABEL,
} from "@/lib/staffless/ask-copy";
import { type AskEvent } from "@/lib/staffless/ask-packets";
import { TopBar } from "@/components/layout/TopBar";

type AskMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  limitedIndex: boolean;
  error: boolean;
};

function parseAskEventLine(line: string): AskEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as AskEvent;
  } catch {
    return null;
  }
}

/**
 * Ask tab: streams StaffLess search/RAG via POST /api/ask (PAT stays on the server).
 */
export function AskPageContent() {
  const chat = useAskChat();
  return (
    <div className="flex min-h-[calc(100vh-10.5rem)] flex-col">
      <TopBar
        title={ASK_PAGE_TITLE}
        subtitle={ASK_PAGE_SUBTITLE}
        highlight
        trailing={
          <button
            type="button"
            onClick={chat.resetChat}
            className={`${taBtnSecondary} gap-1.5 px-3 py-2`}
          >
            <SquarePen className="h-4 w-4" />
            New chat
          </button>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-[var(--border)] dark:bg-[var(--card)]">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          {chat.messages.length === 0 ? (
            <AskEmptyState onPick={(prompt) => void chat.send(prompt)} disabled={chat.busy} />
          ) : (
            <AskThread messages={chat.messages} searching={chat.searching} />
          )}
          <div ref={chat.bottomRef} />
        </div>
        <AskComposer
          value={chat.input}
          busy={chat.busy}
          onChange={chat.setInput}
          onSend={() => void chat.send(chat.input)}
        />
      </div>
    </div>
  );
}

function useAskChat() {
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, searching, busy]);

  const resetChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setSessionId(null);
    setInput("");
    setBusy(false);
    setSearching(false);
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const message = raw.trim();
      if (!message || busy) return;
      setInput("");
      setBusy(true);
      setSearching(true);
      const assistantId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: "user", content: message, limitedIndex: false, error: false },
        { id: assistantId, role: "assistant", content: "", limitedIndex: false, error: false },
      ]);
      await streamAskTurn({
        message,
        sessionId,
        history: messages
          .filter((m) => m.content && !m.error)
          .slice(-16)
          .map((m) => ({ role: m.role, content: m.content })),
        assistantId,
        abortRef,
        setSessionId,
        setSearching,
        setMessages,
      });
      setBusy(false);
      setSearching(false);
    },
    [busy, sessionId]
  );

  return { messages, input, setInput, busy, searching, bottomRef, resetChat, send };
}

function AskEmptyState({
  onPick,
  disabled,
}: {
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl py-8 text-center">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{ASK_EMPTY_TITLE}</h2>
      <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-white/70">{ASK_EMPTY_BODY}</p>
      <p className="mt-2 text-xs text-gray-500 dark:text-white/50">{ASK_EMPTY_HINT}</p>
      <p className="mt-3 text-sm">
        <Link href="/connectors" className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300">
          Open Connectors
        </Link>
      </p>
      <div className="mt-6 flex flex-col gap-2">
        {ASK_EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled}
            onClick={() => onPick(prompt)}
            className="rounded-lg border border-gray-200 px-4 py-2.5 text-left text-sm text-gray-700 hover:border-brand-200 hover:bg-brand-50/60 disabled:opacity-50 dark:border-[var(--border)] dark:text-white/80 dark:hover:bg-white/5"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function AskThread({ messages, searching }: { messages: AskMessage[]; searching: boolean }) {
  const waiting = searching && !messages.some((m) => m.role === "assistant" && m.content);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      {messages.map((msg) => (
        <AskBubble key={msg.id} message={msg} />
      ))}
      {waiting && (
        <div className="max-w-2xl rounded-xl border border-gray-200 bg-white p-4 dark:border-[var(--border)] dark:bg-[var(--card)]">
          <p className="mb-3 flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-white/50">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" />
            {ASK_SEARCHING_LABEL}
          </p>
          <AISkeleton lines={4} />
        </div>
      )}
    </div>
  );
}

function AskBubble({ message }: { message: AskMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[min(36rem,85%)] rounded-xl bg-brand-500 px-4 py-3 text-sm leading-relaxed text-white shadow-theme-sm">
          {message.content}
        </div>
      </div>
    );
  }
  if (!message.content && !message.error) return null;
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-4xl rounded-xl border border-gray-200 bg-white p-5 dark:border-[var(--border)] dark:bg-[var(--card)]">
        {message.content ? <AskMarkdown content={message.content} /> : null}
        {message.error && !message.content && (
          <p className="text-sm text-gray-600 dark:text-white/70">{ASK_PUBLIC_UNAVAILABLE}</p>
        )}
        {message.limitedIndex && (
          <p className="mt-3 max-w-prose text-xs text-gray-500 dark:text-white/50">{ASK_LIMITED_INDEX_HINT}</p>
        )}
      </div>
    </div>
  );
}

function AskComposer({
  value,
  busy,
  onChange,
  onSend,
}: {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="flex gap-2 border-t border-gray-200 bg-gray-50/80 p-4 dark:border-[var(--border)] dark:bg-[var(--sidebar)]">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        disabled={busy}
        maxLength={8000}
        placeholder="Ask about indexed tickets, changes, or documents…"
        className={`${taInput} min-w-0 flex-1`}
      />
      <button
        type="button"
        onClick={onSend}
        disabled={busy || !value.trim()}
        className={`${taBtnPrimary} px-3 disabled:opacity-50`}
        aria-label="Send message"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </button>
    </div>
  );
}

type StreamHandlers = {
  message: string;
  sessionId: string | null;
  history: { role: "user" | "assistant"; content: string }[];
  assistantId: string;
  abortRef: MutableRefObject<AbortController | null>;
  setSessionId: (id: string) => void;
  setSearching: (v: boolean) => void;
  setMessages: Dispatch<SetStateAction<AskMessage[]>>;
};

async function streamAskTurn(h: StreamHandlers): Promise<void> {
  h.abortRef.current?.abort();
  const controller = new AbortController();
  h.abortRef.current = controller;
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: h.message,
        ...(h.sessionId ? { sessionId: h.sessionId } : {}),
        ...(h.history.length > 0 ? { history: h.history } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      patchAssistant(h, {
        content: body.error ?? ASK_PUBLIC_UNAVAILABLE,
        error: true,
      });
      return;
    }
    if (!res.body) {
      patchAssistant(h, { content: ASK_PUBLIC_UNAVAILABLE, error: true });
      return;
    }
    await readAskNdjson(res.body, h);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    patchAssistant(h, { content: ASK_PUBLIC_UNAVAILABLE, error: true });
  }
}

async function readAskNdjson(body: ReadableStream<Uint8Array>, h: StreamHandlers): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) applyAskEvent(parseAskEventLine(line), h);
    }
    if (buffer.trim()) applyAskEvent(parseAskEventLine(buffer), h);
  } finally {
    reader.releaseLock();
  }
}

function applyAskEvent(event: AskEvent | null, h: StreamHandlers): void {
  if (!event) return;
  if (event.type === "session") h.setSessionId(event.sessionId);
  if (event.type === "status" && event.phase === "searching") h.setSearching(true);
  if (event.type === "status" && event.phase === "answering") h.setSearching(false);
  if (event.type === "text") {
    h.setSearching(false);
    h.setMessages((prev) =>
      prev.map((m) => (m.id === h.assistantId ? { ...m, content: m.content + event.text } : m))
    );
  }
  if (event.type === "sources" && event.sources.length === 0) {
    h.setMessages((prev) =>
      prev.map((m) => (m.id === h.assistantId ? { ...m, limitedIndex: true } : m))
    );
  }
  if (event.type === "error") {
    h.setMessages((prev) =>
      prev.map((m) =>
        m.id === h.assistantId
          ? { ...m, error: true, content: m.content || event.message }
          : m
      )
    );
  }
}

function patchAssistant(h: StreamHandlers, patch: Partial<AskMessage>): void {
  h.setMessages((prev) => prev.map((m) => (m.id === h.assistantId ? { ...m, ...patch } : m)));
}
