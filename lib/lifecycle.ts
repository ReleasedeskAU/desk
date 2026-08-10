import type { DeploymentPhase, LifecycleStageView, Release, ReleaseDecision } from "./types";
import { calcReadiness, getBlockers } from "./utils";

/**
 * Legacy demo/command-center stage rail (not the release-status lifecycle graph).
 * Release status SSOT is UserReleaseLifecycleConfig — use ReleaseLifecycleStepper
 * / release-lifecycle-config for configurable statuses.
 */
export const LIFECYCLE_STAGES: { id: LifecycleStageView["id"]; label: string }[] = [
  { id: "planning", label: "Planning" },
  { id: "scheduling", label: "Scheduling" },
  { id: "testing", label: "Testing" },
  { id: "preparing", label: "Preparing" },
  { id: "managing", label: "Managing" },
  { id: "deployment", label: "Deployment" },
];

export function computeLifecycleStages(
  release: Release,
  decision: ReleaseDecision,
  deployPhase: DeploymentPhase
): LifecycleStageView[] {
  const readiness = calcReadiness(release);
  const blockers = getBlockers(release);
  const build = release.build.status;

  let activeIdx = 0;

  if (deployPhase === "Verified" || deployPhase === "Rolled Back") {
    activeIdx = 5;
  } else if (["In Progress", "Verifying", "Failed"].includes(deployPhase)) {
    activeIdx = 5;
  } else if (decision === "Go" || decision === "No-Go") {
    activeIdx = deployPhase === "Scheduled" ? 5 : 4;
  } else if (blockers.length > 0 || readiness < 85) {
    activeIdx = 3;
  } else if (build === "Failed") {
    activeIdx = 2;
  } else if (build === "Running") {
    activeIdx = 2;
  } else if (build !== "Passed") {
    activeIdx = 2;
  } else if (release.targetDate) {
    activeIdx = 3;
  } else {
    activeIdx = 1;
  }

  const details: Record<string, string> = {
    planning: `${release.commits.length} commits · ${release.filesChanged} files`,
    scheduling: release.targetDate ? `Target ${new Date(release.targetDate).toLocaleDateString("en-AU")}` : "No date set",
    testing:
      build === "Passed"
        ? `${release.build.passedTests}/${release.build.testCount} tests passed`
        : build === "Failed"
          ? "Build failing — QA blocked"
          : build === "Running"
            ? "Build running…"
            : "Awaiting CI",
    preparing:
      blockers.length > 0
        ? `${blockers.length} blocker(s) · ${readiness}% ready`
        : `${readiness}% readiness`,
    managing: decision ? `${decision} recorded` : "Awaiting Go / No-Go",
    deployment:
      deployPhase === "Not Started"
        ? "Ready to deploy"
        : deployPhase === "Verified"
          ? "Verified in production"
          : deployPhase === "Rolled Back"
            ? "Rollback complete"
            : deployPhase,
  };

  return LIFECYCLE_STAGES.map((stage, idx) => {
    let status: LifecycleStageView["status"] = "pending";
    if (idx < activeIdx) status = "complete";
    else if (idx === activeIdx) {
      if (stage.id === "testing" && build === "Failed") status = "blocked";
      else status = "active";
    }
    if (deployPhase === "Verified" && idx <= 5) status = idx === 5 ? "complete" : "complete";
    if (deployPhase === "Rolled Back" && idx === 5) status = "blocked";

    return {
      id: stage.id,
      label: stage.label,
      status,
      detail: details[stage.id],
    };
  });
}
