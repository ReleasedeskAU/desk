/**
 * Scripted voice walkthroughs — multi-step release-manager tours.
 * Steps execute navigate / filters; spoken lines are returned for the model.
 */
export type WalkthroughStep =
  | {
      type: "navigate";
      path: string;
      say: string;
    }
  | {
      type: "filter";
      page?: string;
      filters?: Record<string, string>;
      clear?: boolean;
      replace?: boolean;
      say: string;
    }
  | {
      type: "say";
      say: string;
    };

export type VoiceWalkthrough = {
  id: string;
  title: string;
  /** Spoken aliases the model / text fallback can match. */
  aliases: string[];
  description: string;
  steps: WalkthroughStep[];
};

export const VOICE_WALKTHROUGHS: readonly VoiceWalkthrough[] = [
  {
    id: "critical_blockers",
    title: "Critical blockers tour",
    aliases: [
      "critical blockers",
      "show blockers",
      "blocker walkthrough",
      "walk me through blockers",
    ],
    description: "Open Blockers, filter to Critical severity, explain what to do next.",
    steps: [
      {
        type: "navigate",
        path: "/blockers",
        say: "Opening Blockers — this is where open impediments sit against go-live.",
      },
      {
        type: "filter",
        page: "/blockers",
        filters: { severity: "Critical" },
        replace: true,
        say: "Filtering to Critical severity so we only see the blockers that usually stop a release.",
      },
      {
        type: "say",
        say: "Pick any row and ask me to summarize it, or say open the first blocker. Then ask which release it is holding and whether that release is ready.",
      },
    ],
  },
  {
    id: "release_readiness",
    title: "Release readiness tour",
    aliases: [
      "release readiness",
      "are releases ready",
      "readiness walkthrough",
      "show me releases",
    ],
    description: "Open Releases, focus on blocked work, explain readiness questions.",
    steps: [
      {
        type: "navigate",
        path: "/releases",
        say: "Opening the Releases register — our source of truth for go-live readiness.",
      },
      {
        type: "filter",
        page: "/releases",
        filters: { status: "Blocked" },
        replace: true,
        say: "Filtering to Blocked releases so we can see what is not ready.",
      },
      {
        type: "say",
        say: "Ask me about any release by code or name — I will say READY, BLOCKED, or AT RISK and explain why (blockers, conflicts, approvals, sign-offs). You can also clear filters or filter hasBlockers.",
      },
    ],
  },
  {
    id: "pending_approvals",
    title: "Pending approvals tour",
    aliases: [
      "pending approvals",
      "approval queue",
      "approvals walkthrough",
      "show approvals",
    ],
    description: "Open Approval Queue filtered to Pending decisions.",
    steps: [
      {
        type: "navigate",
        path: "/approvals",
        say: "Opening the Approval Queue — CAB and gate decisions that can hold a release.",
      },
      {
        type: "filter",
        page: "/approvals",
        filters: { decision: "Pending" },
        replace: true,
        say: "Showing Pending decisions only.",
      },
      {
        type: "say",
        say: "If you want to approve one, say approve and the approval code — I will propose first, then wait for your yes. I never write without confirmation.",
      },
    ],
  },
  {
    id: "env_conflicts",
    title: "Environment conflicts tour",
    aliases: [
      "environment conflicts",
      "booking conflicts",
      "conflict walkthrough",
      "show conflicts",
    ],
    description: "Open Conflicts then Env Booking conflict filter.",
    steps: [
      {
        type: "navigate",
        path: "/conflicts",
        say: "Opening Conflicts — schedule and environment collisions between releases.",
      },
      {
        type: "say",
        say: "Ask me to open a conflict or jump to Env Booking filtered to conflicts if you want the booking board view.",
      },
      {
        type: "navigate",
        path: "/booking",
        say: "Now Env Booking — where environment holds and conflict flags show up.",
      },
      {
        type: "filter",
        page: "/booking",
        filters: { conflict: "1" },
        replace: true,
        say: "Filtering to bookings flagged with conflicts.",
      },
    ],
  },
  {
    id: "morning_check",
    title: "Morning release check",
    aliases: [
      "morning check",
      "daily briefing",
      "start of day",
      "what needs attention",
    ],
    description: "Inbox → critical blockers → blocked releases.",
    steps: [
      {
        type: "navigate",
        path: "/inbox",
        say: "Starting at Morning Inbox — your daily attention queue.",
      },
      {
        type: "navigate",
        path: "/blockers",
        say: "Next, Blockers — open impediments.",
      },
      {
        type: "filter",
        page: "/blockers",
        filters: { severity: "Critical" },
        replace: true,
        say: "Critical blockers first.",
      },
      {
        type: "navigate",
        path: "/releases",
        say: "Then Releases that are blocked.",
      },
      {
        type: "filter",
        page: "/releases",
        filters: { status: "Blocked" },
        replace: true,
        say: "These releases are not ready. Ask me about any code and I will explain why it is blocked or what would make it ready.",
      },
    ],
  },
] as const;

/**
 * Resolve a walkthrough by id or spoken alias.
 */
export function resolveVoiceWalkthrough(raw: string): VoiceWalkthrough | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  const byId = VOICE_WALKTHROUGHS.find((w) => w.id === q || w.id.replace(/_/g, " ") === q);
  if (byId) return byId;
  for (const w of VOICE_WALKTHROUGHS) {
    if (w.aliases.some((a) => q === a || q.includes(a) || a.includes(q))) return w;
  }
  return null;
}

/**
 * Compact brief of available tours for Live systemInstruction.
 */
export function voiceWalkthroughBrief(): string {
  const ids = VOICE_WALKTHROUGHS.map((w) => `${w.id} (${w.title})`).join("; ");
  return `run_walkthrough tours: ${ids}. Use when the user asks for a walkthrough, tour, show me how, or morning check.`;
}
