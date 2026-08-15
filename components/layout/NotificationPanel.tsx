"use client";

import { useRef, useEffect } from "react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useReleaseStore } from "@/context/ReleaseStoreContext";
import { formatDateTime } from "@/lib/utils";

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationPanel({ open, onClose }: NotificationPanelProps) {
  const { state, dismissNotification, dismissAllNotifications } = useReleaseStore();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-800 text-sm">Notifications</h3>
        <button
          type="button"
          onClick={dismissAllNotifications}
          className="text-xs text-brand-500 hover:text-brand-600"
        >
          Mark all read
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {state.notifications.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">No notifications</p>
        ) : (
          state.notifications.slice(0, 12).map((n) => (
            <div
              key={n.id}
              className={`px-4 py-3 border-b border-gray-50 last:border-0 ${n.read ? "opacity-60" : "bg-brand-50/30"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{n.title}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDateTime(n.timestamp)}</p>
                  {(n.href || n.releaseId) && (
                    <div className="flex flex-wrap gap-3 mt-1">
                      {n.href ? (
                        <ProgressLink
                          href={n.href}
                          onClick={() => {
                            dismissNotification(n.id);
                            onClose();
                          }}
                          className="text-xs text-brand-500 hover:underline"
                        >
                          {n.linkLabel || "View conflict"}
                        </ProgressLink>
                      ) : null}
                      {n.releaseId && (
                      <ProgressLink
                        href={`/releases/${n.releaseId}`}
                        onClick={() => {
                          dismissNotification(n.id);
                          onClose();
                        }}
                        className="text-xs text-brand-500 hover:underline"
                      >
                        View release
                      </ProgressLink>
                      )}
                      {(n.type === "decision" || n.type === "build" || n.type === "approval") && (
                        <ProgressLink
                          href={`/history?release=${n.releaseId}`}
                          onClick={() => {
                            dismissNotification(n.id);
                            onClose();
                          }}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          Audit trail
                        </ProgressLink>
                      )}
                    </div>
                  )}
                </div>
                {!n.read && (
                  <button
                    type="button"
                    onClick={() => dismissNotification(n.id)}
                    className="text-xs text-gray-400 hover:text-gray-600 shrink-0"
                  >
                    ✓
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
