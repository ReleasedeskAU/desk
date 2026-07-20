/**
 * Maps a catalog environment to a booking phase and UI/API field labels.
 * Seed codes like FIN-TEST-01 and catalog names like "Test" both resolve here.
 */

export type BookingPhase = "test" | "uat" | "preprod" | "other";

export type BookingPhaseLabels = {
  phase: BookingPhase;
  /** Short title for the selected env kind (e.g. UAT, Pre-Prod, DR). */
  kind: string;
  envField: string;
  startField: string;
  endField: string;
  daysField: string;
  /** Optional hint under the Environment field. */
  hint?: string;
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Resolves booking phase from environment name/type.
 * @param name - Environment name (e.g. Test, FIN-UAT-01, DR)
 * @param type - Optional environment type from master data
 */
export function resolveBookingPhase(
  name: string,
  type?: string | null,
): BookingPhase {
  const token = normalize([name, type].filter(Boolean).join(" "));
  if (!token) return "other";
  if (token.includes("preprod")) return "preprod";
  if (token.includes("uat")) return "uat";
  if (token.includes("test")) return "test";
  return "other";
}

/**
 * Human labels for the create/edit form and confirmation summary.
 * @param name - Selected environment name
 * @param type - Optional environment type
 */
export function bookingPhaseLabels(
  name: string,
  type?: string | null,
): BookingPhaseLabels {
  const phase = resolveBookingPhase(name, type);
  const raw = (type || name || "Environment").trim();

  if (phase === "uat") {
    return {
      phase,
      kind: "UAT",
      envField: "UAT Env",
      startField: "UAT Start",
      endField: "UAT End",
      daysField: "UAT Days",
    };
  }
  if (phase === "preprod") {
    return {
      phase,
      kind: "Pre-Prod",
      envField: "Pre-Prod Env",
      startField: "Pre-Prod Start",
      endField: "Pre-Prod End",
      daysField: "Pre-Prod Days",
    };
  }
  if (phase === "test") {
    return {
      phase,
      kind: "Test",
      envField: "Test Env",
      startField: "Test Start",
      endField: "Test End",
      daysField: "Test Days",
    };
  }

  const kind = raw;
  const hint =
    normalize(raw) === "dr" || normalize(name) === "dr"
      ? "DR = Disaster Recovery environment."
      : undefined;

  return {
    phase,
    kind,
    envField: "Environment",
    startField: `${kind} Start`,
    endField: `${kind} End`,
    daysField: `${kind} Days`,
    hint,
  };
}

/** Preferred display order for environment pickers. */
const ENV_SORT_RANK: Record<string, number> = {
  dev: 10,
  development: 10,
  test: 20,
  uat: 30,
  preprod: 40,
  prod: 50,
  production: 50,
  dr: 60,
};

/**
 * Sort key for environment options (Dev → Test → UAT → Pre-prod → Prod → DR).
 * @param name - Environment name
 * @param type - Environment type
 */
export function environmentSortRank(name: string, type?: string | null): number {
  const token = normalize(type || name);
  for (const [key, rank] of Object.entries(ENV_SORT_RANK)) {
    if (token === key || token.includes(key)) return rank;
  }
  return 100;
}

export type PhaseDatePayload = {
  testEnvCode: string | null;
  testStart: Date | null;
  testEnd: Date | null;
  testDays: number | null;
  uatEnvCode: string | null;
  uatStart: Date | null;
  uatEnd: Date | null;
  uatDays: number | null;
  preProdEnvCode: string | null;
  preProdStart: Date | null;
  preProdEnd: Date | null;
  preProdDays: number | null;
};

/**
 * Builds phase-specific date/env columns for a single-environment booking.
 * Always fills the primary Environment/Start/End columns (test_*) for table visibility,
 * and mirrors into UAT / Pre-Prod columns when that phase is selected.
 *
 * @param envName - Catalog environment name stored on the booking
 * @param envType - Catalog environment type
 * @param fromDate - Booking window start
 * @param toDate - Booking window end
 * @param days - Inclusive day span
 */
export function buildPhaseDatePayload(
  envName: string,
  envType: string | null | undefined,
  fromDate: Date,
  toDate: Date,
  days: number,
): PhaseDatePayload {
  const phase = resolveBookingPhase(envName, envType);
  const primary: PhaseDatePayload = {
    testEnvCode: envName,
    testStart: fromDate,
    testEnd: toDate,
    testDays: days,
    uatEnvCode: null,
    uatStart: null,
    uatEnd: null,
    uatDays: null,
    preProdEnvCode: null,
    preProdStart: null,
    preProdEnd: null,
    preProdDays: null,
  };

  if (phase === "uat") {
    return {
      ...primary,
      uatEnvCode: envName,
      uatStart: fromDate,
      uatEnd: toDate,
      uatDays: days,
    };
  }
  if (phase === "preprod") {
    return {
      ...primary,
      preProdEnvCode: envName,
      preProdStart: fromDate,
      preProdEnd: toDate,
      preProdDays: days,
    };
  }

  return primary;
}
