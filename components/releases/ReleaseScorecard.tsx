"use client";

import { useRef, useState } from "react";
import { FileDown, Printer, X } from "lucide-react";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ReadinessGauge } from "@/components/gauges/ReadinessGauge";
import { useReleaseStore } from "@/context/ReleaseStoreContext";
import type { Release, ReleaseDecision } from "@/lib/types";
import { buildEnvironmentPromotions } from "@/lib/environment-promotions";
import { calcReadiness, formatDate, formatDateTime, getBlockers } from "@/lib/utils";

interface ReleaseScorecardProps {
  release: Release;
  decision: ReleaseDecision;
  open: boolean;
  onClose: () => void;
}

export function ReleaseScorecard({ release, decision, open, onClose }: ReleaseScorecardProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const { getReleaseDecision, getDeploymentState } = useReleaseStore();
  const stored = getReleaseDecision(release.id);
  const finalDecision = stored?.decision ?? decision ?? release.decision;
  const deploy = getDeploymentState(release);
  const readiness = calcReadiness(release);
  const blockers = getBlockers(release);
  const promotions = buildEnvironmentPromotions(release, deploy.phase);

  if (!open) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 print-modal-overlay">
      <div className="glass-panel flex max-h-[90vh] w-full max-w-3xl flex-col shadow-theme-md print:shadow-none print:max-h-none print:w-full print:max-w-none">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 print:hidden">
          <div>
            <h2 className="font-semibold text-gray-800">Release Scorecard</h2>
            <p className="text-sm text-gray-500">{release.version} — printable readiness summary</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              <FileDown className="w-4 h-4" /> Export PDF
            </button>
            <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div ref={printRef} className="scorecard-print overflow-y-auto p-6 md:p-8 print:overflow-visible">
          <div className="flex items-start justify-between gap-4 border-b border-gray-200 pb-6 mb-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">ReleaseDesk Everywhere Scorecard</p>
              <h1 className="text-2xl font-bold text-gray-900 mt-1">{release.version} — {release.name}</h1>
              <p className="text-sm text-gray-600 mt-1">{release.team} · {release.owner} · Target {formatDate(release.targetDate)}</p>
            </div>
            <ReadinessGauge value={readiness} size={120} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Status</p>
              <div className="mt-1"><StatusBadge status={release.status} /></div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Decision</p>
              <div className="mt-1">
                {finalDecision ? <StatusBadge status={finalDecision} /> : <span className="text-sm text-gray-400">Pending</span>}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Deployment</p>
              <div className="mt-1"><StatusBadge status={deploy.phase} /></div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Files changed</p>
              <p className="text-lg font-bold text-gray-800 mt-1">{release.filesChanged}</p>
            </div>
          </div>

          {stored?.rationale && (
            <div className="mb-6 rounded-lg bg-amber-50 border border-amber-100 p-4">
              <p className="text-xs font-medium text-amber-800">Decision rationale</p>
              <p className="text-sm text-amber-900 mt-1">{stored.rationale}</p>
              <p className="text-xs text-amber-700 mt-2">{stored.decidedBy} · {formatDateTime(stored.decidedAt)}</p>
            </div>
          )}

          <section className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-3">Approval gates</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 font-medium">Gate</th>
                  <th className="pb-2 font-medium">Approver</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {release.approvals.map((a) => (
                  <tr key={a.gate} className="border-b border-gray-100">
                    <td className="py-2">{a.gate}</td>
                    <td className="py-2 text-gray-600">{a.approver ?? "—"}</td>
                    <td className="py-2"><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-3">Blockers</h3>
            {blockers.length === 0 ? (
              <p className="text-sm text-emerald-600">No blockers identified.</p>
            ) : (
              <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-3">Environment promotion (prod)</h3>
            <div className="flex flex-wrap gap-2">
              {promotions
                .filter((p) => p.environment === "prod")
                .map((p) => (
                  <span key={p.region} className="text-xs border border-gray-200 rounded-lg px-2 py-1">
                    {p.region}: <strong>{p.version}</strong> ({p.status})
                  </span>
                ))}
            </div>
          </section>

          <section className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-3">Build</h3>
            <p className="text-sm text-gray-700">
              Build #{release.build.id} · {release.build.pipeline} ·{" "}
              <StatusBadge status={release.build.status} /> ·{" "}
              {release.build.passedTests}/{release.build.testCount} tests passed
            </p>
          </section>

          {release.changeRecord && (
            <section className="mb-6">
              <h3 className="font-semibold text-gray-800 mb-3">Change record</h3>
              <p className="text-sm text-gray-700">
                {release.changeRecord.crNumber} · Risk: {release.changeRecord.riskTier} · CAB:{" "}
                <StatusBadge status={release.changeRecord.cabStatus} />
              </p>
            </section>
          )}

          {deploy.autoRollback && (
            <section className="mb-6 rounded-lg border border-error-200 bg-error-50 p-4">
              <h3 className="font-semibold text-error-800 mb-2">Auto-rollback</h3>
              <p className="text-sm text-error-700">{deploy.rollbackReason}</p>
              {deploy.rollbackNarrative && (
                <p className="text-sm text-gray-700 mt-2">{deploy.rollbackNarrative}</p>
              )}
            </section>
          )}

          <footer className="border-t border-gray-200 pt-4 text-xs text-gray-400">
            Generated by ReleaseDesk Everywhere · {formatDateTime(new Date().toISOString())} · Demo data — not for production audit
          </footer>
        </div>
      </div>
    </div>
  );
}

export function ReleaseScorecardButton({
  release,
  decision,
}: {
  release: Release;
  decision: ReleaseDecision;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white/80 px-3 py-2 text-sm font-medium text-gray-700 shadow-theme-sm hover:bg-brand-50 hover:text-brand-600 transition-colors"
      >
        <FileDown className="w-4 h-4" /> Scorecard
      </button>
      <ReleaseScorecard release={release} decision={decision} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
