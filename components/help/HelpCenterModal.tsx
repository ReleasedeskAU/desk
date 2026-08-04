"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import {
  allGuideSections,
  RELEASE_DESK_WORKFLOW,
  resolvePageGuide,
  dataSourceLabel,
  restoreAllPageHelp,
} from "@/lib/page-guide";
import { cn } from "@/lib/utils";
import { BookOpen, Map, RotateCcw, X } from "lucide-react";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";

const WELCOME_KEY = "sentinel-welcome-v1";

export function NewUserWelcomeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(WELCOME_KEY)) return;
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, []);

  const close = (remember: boolean) => {
    if (remember) localStorage.setItem(WELCOME_KEY, "1");
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-100 bg-brand-50/80">
          <h2 id="welcome-title" className="text-lg font-bold text-gray-900">
            Welcome to Sentinel
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            AI-powered release command center. Here&apos;s how release managers use it day to day.
          </p>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1">
              <Map className="h-3.5 w-3.5" /> Release Desk workflow
            </p>
            <ol className="space-y-2">
              {RELEASE_DESK_WORKFLOW.map((step) => (
                <li key={step.step} className="flex gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white text-xs font-bold">
                    {step.step}
                  </span>
                  <span>
                    <ProgressLink href={step.href} className="font-medium text-brand-700 hover:underline">
                      {step.label}
                    </ProgressLink>
                    <span className="block text-xs text-gray-500">{step.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 text-sm text-gray-600 space-y-2">
            <p>
              <strong className="text-gray-800">Every desk page</strong> has collapsible Full Documentation and Quick Reference at the top — use the{" "}
              <strong className="text-gray-800">?</strong> button in the header to jump there, or{" "}
              <kbd className="text-xs border border-gray-200 rounded px-1">⌘K</kbd> to search naturally
              (e.g. &ldquo;blocked in FIN&rdquo;).
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 flex flex-wrap gap-2 justify-end">
          <button type="button" className={taBtnSecondary} onClick={() => close(false)}>
            Remind me later
          </button>
          <ProgressLink href="/inbox" className={taBtnPrimary + " text-sm !py-2.5"} onClick={() => close(true)}>
            Go to Morning Inbox
          </ProgressLink>
          <button type="button" className={taBtnSecondary + " text-sm"} onClick={() => close(true)}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export function HelpCenterModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const current = resolvePageGuide(pathname);
  const sections = allGuideSections();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[8vh]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-center-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-brand-600" />
            <h2 id="help-center-title" className="font-semibold text-gray-900">
              Help & navigation
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-6 flex-1">
          {current && (
            <div className="rounded-xl border-2 border-brand-200 bg-brand-50/50 p-4">
              <p className="text-xs font-semibold uppercase text-brand-600 mb-1">You are here</p>
              <p className="font-medium text-gray-900">{current.title}</p>
              <p className="text-sm text-gray-600 mt-1">{current.description}</p>
              <p className="text-[10px] text-gray-400 mt-2">{dataSourceLabel(current.dataSource)}</p>
            </div>
          )}

          {sections.map((section) => (
            <div key={section.title ?? "main"}>
              {section.title && (
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{section.title}</p>
              )}
              <ul className="space-y-2">
                {section.items.map(({ href, label, guide }) => (
                  <li key={href}>
                    <ProgressLink
                      href={href}
                      onClick={onClose}
                      className={cn(
                        "block rounded-xl border px-4 py-3 transition-colors hover:border-brand-300 hover:bg-brand-50/40",
                        pathname === href || (href !== "/" && pathname.startsWith(href + "/"))
                          ? "border-brand-300 bg-brand-50/60"
                          : "border-gray-100"
                      )}
                    >
                      <span className="text-sm font-medium text-gray-800">{label}</span>
                      <span className="block text-xs text-gray-500 mt-0.5 line-clamp-2">{guide.description}</span>
                    </ProgressLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="pt-2 border-t border-gray-100">
            <button
              type="button"
              className="mt-4 flex items-center gap-1 text-xs text-gray-500 hover:text-brand-600"
              onClick={() => {
                restoreAllPageHelp();
                onClose();
              }}
            >
              <RotateCcw className="h-3 w-3" /> Reset all dismissed page help banners
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
