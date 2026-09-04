"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, Send, SquarePen } from "lucide-react";
import { AskGroundingBadge } from "@/components/ask/AskGroundingBadge";
import { AskMarkdown } from "@/components/ask/AskMarkdown";
import { TopBar } from "@/components/layout/TopBar";
import { AISkeleton } from "@/components/ui/AISkeleton";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import {
  ASK_COMPOSER_PLACEHOLDER,
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
import type { AskGrounding } from "@/lib/staffless/ask-grounding";
import { type AskEvent } from "@/lib/staffless/ask-packets";
import { cn } from "@/lib/utils";

type AskMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  limitedIndex: boolean;
  error: boolean;
  grounding: AskGrounding | null;
  createdAt: number;
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

function formatAskTime(createdAt: number): string {
  return new Date(createdAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function emptyAssistant(id: string): AskMessage {
  return {
    id,
    role: "assistant",
    content: "",
    limitedIndex: false,
    error: false,
    grounding: null,
    createdAt: Date.now(),
  };
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
        <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-4 py-5 sm:px-8 sm:py-6">
          {chat.messages.length === 0 ? (
            <AskEmptyState onPick={(prompt) => void chat.send(prompt)} disabled={chat.busy} />
          ) : (
            <AskThread messages={chat.messages} />
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
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const resetChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setSessionId(null);
    setInput("");
    setBusy(false);
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const message = raw.trim();
      if (!message || busy) return;
      setInput("");
      setBusy(true);
      const assistantId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: `u-${Date.now()}`,
          role: "user",
          content: message,
          limitedIndex: false,
          error: false,
          grounding: null,
          createdAt: Date.now(),
        },
        emptyAssistant(assistantId),
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
        setMessages,
      });
      setBusy(false);
    },
    [busy, sessionId]
  );

  return { messages, input, setInput, busy, bottomRef, resetChat, send };
}

function AskEmptyState({
  onPick,
  disabled,
}: {
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl px-1 py-6 text-center sm:py-10">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{ASK_EMPTY_TITLE}</h2>
      <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-white/70">{ASK_EMPTY_BODY}</p>
      <p className="mt-2 text-xs text-gray-500 dark:text-white/50">{ASK_EMPTY_HINT}</p>
      <p className="mt-3 text-sm">
        <Link href="/connectors" className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300">
          Open Connectors
        </Link>
      </p>
      <div className="mt-6 flex flex-col gap-2 text-left">
        {ASK_EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled}
            onClick={() => onPick(prompt)}
            className={`${taBtnSecondary} w-full justify-start px-4 py-2.5 text-left text-sm disabled:opacity-50`}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function AskThread({ messages }: { messages: AskMessage[] }) {
  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-5"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      {messages.map((msg) => (
        <AskBubble key={msg.id} message={msg} />
      ))}
    </div>
  );
}

function AskBubble({ message }: { message: AskMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[min(36rem,88%)] rounded-2xl rounded-br-md bg-brand-500 px-4 py-3 text-sm leading-relaxed text-white shadow-theme-sm">
          {message.content}
        </div>
        <time
          dateTime={new Date(message.createdAt).toISOString()}
          className="px-1 text-[11px] text-gray-400 dark:text-white/40"
        >
          {formatAskTime(message.createdAt)}
        </time>
      </div>
    );
  }
  if (!message.content && !message.error) {
    return <AskLoadingCard grounding={message.grounding} />;
  }
  return (
    <div className="group/msg flex justify-start">
      <div className="relative w-full max-w-3xl rounded-xl rounded-bl-md border border-gray-200 bg-white p-4 sm:p-5 dark:border-[var(--border)] dark:bg-[var(--card)]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {message.grounding && !message.error ? <AskGroundingBadge kind={message.grounding} /> : null}
            <time
              dateTime={new Date(message.createdAt).toISOString()}
              className="text-[11px] text-gray-400 dark:text-white/40"
            >
              {formatAskTime(message.createdAt)}
            </time>
          </div>
          {message.content ? <AskCopyButton text={message.content} /> : null}
        </div>
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

function AskLoadingCard({ grounding }: { grounding: AskGrounding | null }) {
  return (
    <div
      className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-[var(--border)] dark:bg-[var(--card)]"
      aria-busy="true"
      aria-label={ASK_SEARCHING_LABEL}
    >
      <div className="mb-3 flex items-center gap-2">
        {grounding ? (
          <AskGroundingBadge kind={grounding} />
        ) : (
          <p className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-white/50">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" />
            {ASK_SEARCHING_LABEL}
          </p>
        )}
      </div>
      <AISkeleton lines={4} />
    </div>
  );
}

function AskCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={cn(
        taBtnSecondary,
        "shrink-0 gap-1 px-2 py-1 text-xs opacity-100 transition-opacity",
        "md:opacity-0 md:group-hover/msg:opacity-100 md:group-focus-within/msg:opacity-100 md:focus-visible:opacity-100"
      )}
      aria-label={copied ? "Answer copied" : "Copy answer"}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
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
    <div className="flex gap-2 border-t border-gray-200 bg-gray-50/80 p-3 sm:p-4 dark:border-[var(--border)] dark:bg-[var(--sidebar)]">
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
        placeholder={ASK_COMPOSER_PLACEHOLDER}
        aria-label={ASK_COMPOSER_PLACEHOLDER}
        className={`${taInput} min-w-0 flex-1`}
      />
      <button
        type="button"
        onClick={onSend}
        disabled={busy || !value.trim()}
        className={`${taBtnPrimary} shrink-0 px-3 disabled:opacity-50`}
        aria-label="Send message"
        aria-busy={busy}
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
  if (event.type === "grounding") {
    h.setMessages((prev) =>
      prev.map((m) => (m.id === h.assistantId ? { ...m, grounding: event.kind } : m))
    );
  }
  if (event.type === "text") {
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
          ? { ...m, error: true, content: m.content || event.message, grounding: null }
          : m
      )
    );
  }
}

function patchAssistant(h: StreamHandlers, patch: Partial<AskMessage>): void {
  h.setMessages((prev) => prev.map((m) => (m.id === h.assistantId ? { ...m, ...patch } : m)));
}
