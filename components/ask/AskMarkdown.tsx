"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  dataTableTableClass,
  tableCell,
  tableHeadCell,
  tableHeadRow,
  tableRow,
} from "@/components/ui/data-table";
import {
  ASK_TABLE_PREVIEW_ROWS,
  parseAskInline,
  parseAskMarkdown,
  type AskMdBlock,
  type AskMdInline,
} from "@/lib/staffless/ask-markdown";

/**
 * Render Ask assistant markdown with Release Desk table styles.
 * Tables use the shared DataTable cell/header classes and a bounded scrollport.
 */
export function AskMarkdown({ content, className }: { content: string; className?: string }) {
  const blocks = parseAskMarkdown(content);
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)}>
      {blocks.map((block, i) => (
        <AskMdBlockView key={`${block.type}-${i}`} block={block} />
      ))}
    </div>
  );
}

function AskMdBlockView({ block }: { block: AskMdBlock }) {
  if (block.type === "heading") {
    const Tag = block.level === 2 ? "h3" : "h4";
    return (
      <Tag className="text-sm font-bold text-gray-900 dark:text-white">
        <AskInline text={block.text} />
      </Tag>
    );
  }
  if (block.type === "list") {
    const List = block.ordered ? "ol" : "ul";
    return (
      <List className={cn("space-y-1.5 pl-1", block.ordered ? "list-none" : "")}>
        {block.items.map((item, i) => (
          <li key={i} className="flex gap-2 text-gray-700 dark:text-white/90">
            <span className="mt-0.5 w-5 shrink-0 font-semibold text-brand-600 dark:text-brand-400">
              {block.ordered ? `${i + 1}.` : "•"}
            </span>
            <span>
              <AskInline text={item} />
            </span>
          </li>
        ))}
      </List>
    );
  }
  if (block.type === "code") {
    return (
      <pre className="overflow-x-auto rounded-lg bg-gray-100 px-3 py-2 font-mono text-[12px] text-gray-800 dark:bg-white/10 dark:text-white/80">
        {block.text}
      </pre>
    );
  }
  if (block.type === "table") {
    return <AskMdTable headers={block.headers} rows={block.rows} />;
  }
  return (
    <p className="max-w-prose text-gray-700 dark:text-white/90">
      {block.text.split("\n").map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          <AskInline text={line} />
        </span>
      ))}
    </p>
  );
}

function AskMdTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const [expanded, setExpanded] = useState(false);
  const overflow = rows.length > ASK_TABLE_PREVIEW_ROWS;
  const visible = expanded || !overflow ? rows : rows.slice(0, ASK_TABLE_PREVIEW_ROWS);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-[var(--border)]">
      <div className="data-table-body max-h-80">
        <table className={dataTableTableClass}>
          <thead>
            <tr className={cn(tableHeadRow, "bg-gray-50 dark:bg-[var(--card)]")}>
              {headers.map((header, hi) => (
                <th key={`${hi}-${header}`} className={tableHeadCell} title={header}>
                  <AskInline text={header} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, ri) => (
              <tr key={ri} className={tableRow}>
                {row.map((cell, ci) => (
                  <td
                    key={`${ri}-${ci}`}
                    className={cn(tableCell, ci === 0 && "whitespace-nowrap font-mono text-xs font-semibold")}
                  >
                    <AskInline text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full border-t border-gray-200 px-4 py-2 text-left text-xs font-medium text-brand-600 hover:bg-gray-50 dark:border-[var(--border)] dark:text-brand-300 dark:hover:bg-white/5"
        >
          {expanded
            ? "Show fewer rows"
            : `Show all ${rows.length} rows (${rows.length - ASK_TABLE_PREVIEW_ROWS} more)`}
        </button>
      )}
    </div>
  );
}

function AskInline({ text }: { text: string }) {
  return <>{parseAskInline(text).map((part, i) => inlineNode(part, i))}</>;
}

function inlineNode(part: AskMdInline, key: number): ReactNode {
  if (part.type === "bold") {
    return (
      <strong key={key} className="font-semibold text-gray-900 dark:text-white">
        {part.text}
      </strong>
    );
  }
  if (part.type === "code") {
    return (
      <code
        key={key}
        className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[12px] text-brand-700 dark:bg-white/10 dark:text-brand-300"
      >
        {part.text}
      </code>
    );
  }
  if (part.type === "link") {
    return (
      <a
        key={key}
        href={part.href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        {part.text}
      </a>
    );
  }
  return <span key={key}>{part.text}</span>;
}
