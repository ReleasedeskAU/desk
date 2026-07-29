/**
 * run_walkthrough tool — multi-step guided tours (navigate + filters + spoken script).
 */
import {
  resolveVoiceWalkthrough,
  voiceWalkthroughBrief,
  VOICE_WALKTHROUGHS,
  type VoiceWalkthrough,
} from "@/lib/voice/walkthrough-catalog";
import { handleNavigateTo, type NavigateDeps } from "@/lib/voice/handlers/navigate";
import { handleApplyListFilters } from "@/lib/voice/handlers/filters";

export type RunWalkthroughArgs = {
  tour?: unknown;
  id?: unknown;
};

export type RunWalkthroughResult = {
  ok: boolean;
  tool: "run_walkthrough";
  tourId?: string;
  title?: string;
  /** Lines the model should speak in order (after tools already ran). */
  script?: string[];
  availableTours?: string[];
  reason?: string;
  instruction: string;
  actionLine: string;
};

function pickTour(args: RunWalkthroughArgs): VoiceWalkthrough | null {
  const raw =
    (typeof args.tour === "string" && args.tour.trim()) ||
    (typeof args.id === "string" && args.id.trim()) ||
    "";
  if (!raw) return null;
  return resolveVoiceWalkthrough(raw);
}

/**
 * Execute a named walkthrough: navigate/filter steps run immediately; script returned for speech.
 * @param args - tour id or spoken alias.
 * @param deps - Router adapters shared with navigate/filters.
 */
export async function handleRunWalkthrough(
  args: RunWalkthroughArgs,
  deps: NavigateDeps
): Promise<RunWalkthroughResult> {
  const tour = pickTour(args);
  if (!tour) {
    const available = VOICE_WALKTHROUGHS.map((w) => w.id);
    return {
      ok: false,
      tool: "run_walkthrough",
      availableTours: available,
      reason: "Unknown tour — pass tour=critical_blockers|release_readiness|pending_approvals|env_conflicts|morning_check",
      instruction: voiceWalkthroughBrief(),
      actionLine: "Walkthrough failed — unknown tour",
    };
  }

  const script: string[] = [];

  for (const step of tour.steps) {
    if (step.type === "navigate") {
      const nav = await handleNavigateTo({ path: step.path }, deps);
      script.push(step.say);
      if (!nav.ok) {
        script.push(
          `I could not open ${step.path} (${nav.reason ?? "blocked"}). Continuing the tour narrative.`
        );
      }
    } else if (step.type === "filter") {
      const fil = await handleApplyListFilters(
        {
          page: step.page,
          filters: step.filters,
          clear: step.clear,
          replace: step.replace,
        },
        deps
      );
      script.push(step.say);
      if (!fil.ok) {
        script.push(
          `Filter step did not apply (${fil.reason ?? "failed"}). You can still ask me to filter manually.`
        );
      }
    } else {
      script.push(step.say);
    }
  }

  return {
    ok: true,
    tool: "run_walkthrough",
    tourId: tour.id,
    title: tour.title,
    script,
    instruction:
      "Speak the script lines in order, briefly, as a professional release manager. Do not re-call navigate/filter for steps already done. After the tour, offer get_summary on a release or explain_page.",
    actionLine: `Walkthrough: ${tour.title}`,
  };
}
