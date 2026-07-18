"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DbReleaseDetail } from "@/components/releases/DbReleaseDetail";
import { isSyntheticReleaseId, SyntheticReleaseDetail } from "@/components/releases/SyntheticReleaseDetail";
import { safeFetchJson } from "@/lib/safe-fetch";

/**
 * Release detail route — resolves synthetic vs DB releases after mount.
 * Uses useParams (not React.use on a Promise) to avoid suspend/setState races.
 */
export default function ReleaseDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [mode, setMode] = useState<"loading" | "db" | "synthetic" | "missing">(() =>
    id && isSyntheticReleaseId(id) ? "synthetic" : "loading"
  );

  useEffect(() => {
    if (!id) {
      setMode("missing");
      return;
    }
    if (isSyntheticReleaseId(id)) {
      setMode("synthetic");
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson(`/api/releases/${id}`, {
        signal: ac.signal,
        label: "release-detail-mode",
        rejectHttpErrors: false,
      });
      if (cancelled || ac.signal.aborted) return;
      setMode(result.ok && result.status >= 200 && result.status < 300 ? "db" : "missing");
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [id]);

  if (!id || mode === "loading") return <p className="text-gray-500">Loading release…</p>;
  if (mode === "missing") return <p className="text-gray-500">Release not found.</p>;
  if (mode === "synthetic") return <SyntheticReleaseDetail id={id} />;
  return <DbReleaseDetail id={id} />;
}
