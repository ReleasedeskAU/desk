"use client";

import {
  RiskHeatMapSection,
  type RiskRow,
} from "@/app/(main)/risks/RiskRegisterContent";
import { ThemeModeProvider, useThemeMode } from "@/context/ThemeModeContext";

const RELEASE = {
  id: "release-preview",
  releaseCode: "REL-HEATMAP",
  name: "Risk heat-map visual QA",
  status: "In Progress",
  startDate: "2026-07-01",
  releaseDate: "2026-07-31",
};

const CELLS: Array<[number, number, number]> = [
  [5, 5, 2],
  [4, 5, 1],
  [4, 4, 1],
  [3, 3, 2],
  [3, 4, 2],
  [2, 3, 1],
  [2, 4, 1],
  [1, 2, 1],
];

const RISKS: RiskRow[] = CELLS.flatMap(([likelihood, impact, count], cellIndex) =>
  Array.from({ length: count }, (_, index) => ({
    id: `risk-${cellIndex}-${index}`,
    riskCode: `RSK-${cellIndex + 1}${index + 1}`,
    releaseId: RELEASE.id,
    release: RELEASE,
    applicationName: "Sentinel",
    departmentName: "Release Management",
    category: "Delivery",
    description: "Visual QA risk",
    likelihood,
    impact,
    riskScore: likelihood * impact,
    affectedArea: "Deployment",
    mitigationStrategy: "Review before CAB",
    riskOwner: {
      id: "owner-preview",
      userId: "USR-QA",
      name: "QA Owner",
      email: "qa@example.invalid",
    },
    status: "Monitoring",
    notes: null,
  }))
);

function RiskHeatMapPreviewContent() {
  const { mode, setMode } = useThemeMode();
  const dark = mode === "dark";

  return (
    <main className={dark ? "min-h-screen bg-[#0f172a] p-5 sm:p-8" : "min-h-screen bg-[#f4f7fe] p-5 sm:p-8"}>
      <div className="mx-auto mb-4 flex max-w-5xl justify-end">
        <button
          type="button"
          data-preview-theme="toggle"
          onClick={() => setMode(dark ? "light" : "dark")}
          className="rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-slate-600 shadow-sm dark:bg-white/10 dark:text-white/70"
        >
          {dark ? "Light mode" : "Dark mode"}
        </button>
      </div>
      <div className="mx-auto max-w-5xl">
        <RiskHeatMapSection
          risks={RISKS}
          selectedLikelihood=""
          selectedImpact=""
          onCellSelect={() => undefined}
          onOwnerSelect={() => undefined}
        />
      </div>
    </main>
  );
}

/** Public development-only visual QA surface for all risk heat-map modes. */
export default function RiskHeatMapPreviewPage() {
  return (
    <ThemeModeProvider>
      <RiskHeatMapPreviewContent />
    </ThemeModeProvider>
  );
}
