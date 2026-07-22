/**
 * Typed domain errors for Copilot Phase 1 service-layer guards.
 * Matches Sentinel's throw-Error style; subclasses enable instanceof checks in tests/API.
 */

/** Thrown when application code attempts to mutate or delete an append-only ReleaseEvent. */
export class ReleaseEventImmutableError extends Error {
  readonly code = "RELEASE_EVENT_IMMUTABLE" as const;

  /**
   * @param operation - Attempted operation name (e.g. "update", "delete").
   */
  constructor(operation: string) {
    super(
      `ReleaseEvent is append-only; ${operation} is not allowed. Use appendEvent() to write new rows.`
    );
    this.name = "ReleaseEventImmutableError";
  }
}

/** Thrown when a ServiceDependency would point a service at itself. */
export class ServiceDependencySelfReferenceError extends Error {
  readonly code = "SERVICE_DEPENDENCY_SELF_REFERENCE" as const;

  /**
   * @param serviceId - The service id that was used as both source and target.
   */
  constructor(serviceId: string) {
    super(
      `ServiceDependency rejected: sourceServiceId and targetServiceId must differ (got "${serviceId}").`
    );
    this.name = "ServiceDependencySelfReferenceError";
  }
}

/**
 * Thrown when calculateDeploymentOrder cannot produce a valid topo order
 * because the selected services contain a directed cycle.
 */
export class CycleError extends Error {
  readonly code = "DEPENDENCY_CYCLE" as const;
  /** Ordered cycle path including the repeated closing node (e.g. [A,B,C,A]). */
  readonly path: string[];

  /**
   * @param path - Offending cycle path from detectCycles (ordered, closed).
   */
  constructor(path: string[]) {
    super(
      `Dependency cycle prevents a valid deployment order: ${path.join(" → ")}`
    );
    this.name = "CycleError";
    this.path = path;
  }
}
