/**
 * run_walkthrough tool — multi-step guided tours (navigate + filters + scroll + spoken script).
 * Includes a dynamic current_page tour that explains whatever page is open.
 */
import {
  resolveVoiceWalkthrough,
  voiceWalkthroughBrief,
  VOICE_WALKTHROUGHS,
  type VoiceWalkthrough,
} from "@/lib/voice/walkthrough-catalog";
import { handleNavigateTo, type NavigateDeps } from "@/lib/voice/handlers/navigate";
import { handleApplyListFilters } from "@/lib/voice/handlers/filters";
import { handleScrollPage } from "@/lib/voice/handlers/scroll";
import { handleExplainPage } from "@/lib/voice/handlers/explain-page";
import { handleGetPageContext } from "@/lib/voice/handlers/page-context";
import { resolveVoicePageExplain } from "@/lib/voice/page-explain-catalog";
import { settingsHrefForTab } from "@/lib/settings-tabs";

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

const CURRENT_PAGE_ALIASES = [
  "current_page",
  "current page",
  "this page",
  "this page walkthrough",
  "walk me through this page",
  "walkthrough this page",
  "tour this page",
  "explain and walk this page",
  "settings walkthrough",
  "walk me through settings",
];

function isCurrentPageTour(raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return false;
  return CURRENT_PAGE_ALIASES.some(
    (a) => q === a || q.includes(a) || a.includes(q)
  );
}

function pickTour(args: RunWalkthroughArgs): VoiceWalkthrough | null {
  const raw =
    (typeof args.tour === "string" && args.tour.trim()) ||
    (typeof args.id === "string" && args.id.trim()) ||
    "";
  if (!raw) return null;
  if (isCurrentPageTour(raw)) return null; // handled separately
  return resolveVoiceWalkthrough(raw);
}

/**
 * Dynamic tour for whatever page is currently open: explain → count → scroll sections.
 * @param deps - Router / href adapters.
 */
async function runCurrentPageTour(
  deps: NavigateDeps
): Promise<RunWalkthroughResult> {
  const href =
    deps.getCurrentHref?.() ??
    (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/");

  await handleScrollPage({ direction: "top" });

  const explain = await handleExplainPage({}, deps);
  const ctx = await handleGetPageContext({}, deps);
  const page = resolveVoicePageExplain(undefined, href);

  const script: string[] = [];
  if (explain.ok && explain.explanation) {
    script.push(explain.explanation);
  } else {
    script.push(
      `You are on ${href}. I will walk the main content; ask me to open any sidebar tab if this is not the page you meant.`
    );
  }

  if (ctx.ok && typeof ctx.totalCount === "number") {
    script.push(
      ctx.totalCount === 0
        ? "This view is not publishing a data table right now, or the table is empty under current filters."
        : `This page’s table shows ${ctx.totalCount} row${ctx.totalCount === 1 ? "" : "s"} right now (live count from the page, not a hardcoded number).`
    );
    if (ctx.rows && ctx.rows.length > 0) {
      const sample = ctx.rows
        .slice(0, 5)
        .map((r) => r.code)
        .join(", ");
      script.push(
        `Sample codes on screen: ${sample}${
          (ctx.totalCount ?? 0) > 5 ? `, and more among the ${ctx.totalCount}` : ""
        }.`
      );
    }
  }

  await handleScrollPage({ direction: "down" });
  script.push(
    "I scrolled the main content so we can see more of the page while I continue."
  );

  if (page?.sections && page.sections.length > 0) {
    for (const section of page.sections) {
      if (page.path === "/settings") {
        const tabHref = settingsHrefForTab(section.id);
        const nav = await handleNavigateTo({ path: tabHref, label: section.label }, deps);
        if (nav.ok) {
          script.push(`${section.label}: ${section.summary}`);
        } else {
          script.push(
            `${section.label}: ${section.summary} (tab navigation was blocked — you can open it from the Settings left nav).`
          );
        }
        await handleScrollPage({ direction: "down" });
      } else {
        script.push(`${section.label}: ${section.summary}`);
        await handleScrollPage({ direction: "down" });
      }
    }
  } else {
    await handleScrollPage({ direction: "down" });
    script.push(
      "Ask me to filter this list, open a row, or jump to a related sidebar tab when you are ready."
    );
  }

  script.push(
    "That is the page walkthrough. Ask how many rows, open a record, or start a named tour like morning_check if you want a cross-page flow."
  );

  return {
    ok: true,
    tool: "run_walkthrough",
    tourId: "current_page",
    title: page ? `${page.title} page tour` : "Current page tour",
    script,
    instruction:
      "Speak the script lines in order as a professional release manager. Scrolling and tab navigation already ran — do not re-call them unless the user asks. Prefer totalCount from get_page_context for counts.",
    actionLine: page
      ? `Walkthrough: ${page.title} (current page)`
      : "Walkthrough: current page",
  };
}

/**
 * Execute a named walkthrough: navigate/filter/scroll steps run immediately; script returned for speech.
 * @param args - tour id or spoken alias (including current_page / this page).
 * @param deps - Router adapters shared with navigate/filters.
 */
export async function handleRunWalkthrough(
  args: RunWalkthroughArgs,
  deps: NavigateDeps
): Promise<RunWalkthroughResult> {
  const raw =
    (typeof args.tour === "string" && args.tour.trim()) ||
    (typeof args.id === "string" && args.id.trim()) ||
    "";

  // Empty / “this page” → dynamic tour of whatever is open (explain + count + scroll).
  if (!raw || isCurrentPageTour(raw)) {
    return runCurrentPageTour(deps);
  }

  const tour = pickTour(args);
  if (!tour) {
    const available = [
      "current_page",
      ...VOICE_WALKTHROUGHS.map((w) => w.id),
    ];
    return {
      ok: false,
      tool: "run_walkthrough",
      availableTours: available,
      reason:
        "Unknown tour — pass tour=current_page|critical_blockers|release_readiness|pending_approvals|env_conflicts|morning_check",
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
    } else if (step.type === "scroll") {
      await handleScrollPage({ direction: step.direction });
      script.push(step.say);
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
