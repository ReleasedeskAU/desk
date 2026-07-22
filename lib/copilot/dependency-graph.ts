/**
 * Copilot P1-S2 — in-memory dependency graph engine.
 *
 * Pure TypeScript graph algorithms (no Next.js / React / Prisma in this file).
 * Live DB loading is delegated to {@link ./dependency-graph-db} only when
 * {@link buildGraph} is called without an injected loader.
 *
 * Edge direction matches ServiceDependency: sourceServiceId → targetServiceId.
 * Blast radius walks outgoing edges (forward BFS); first visit = minimum depth.
 */

/** Directed edge between two services (same semantics as ServiceDependency). */
export type ServiceEdge = {
  sourceServiceId: string;
  targetServiceId: string;
};

export type BlastRadius = {
  /** Service ids in the blast radius, including the origin. */
  services: string[];
  /** Minimum hop distance from the origin (origin = 0). */
  depth: Map<string, number>;
};

/**
 * Optional loader override for tests/benchmarks (avoids live DB).
 */
export type DependencyGraphLoader = {
  loadServices: (orgId?: string) => Promise<{ id: string }[]>;
  loadEdges: (orgId?: string) => Promise<ServiceEdge[]>;
};

/**
 * In-memory adjacency graph over Copilot Service / ServiceDependency rows.
 * Construct via {@link DependencyGraph.fromData} (tests/fixtures) or
 * {@link buildGraph} (live DB or injected loader).
 */
export class DependencyGraph {
  /** All known service ids (including isolated nodes). */
  readonly serviceIds: ReadonlySet<string>;
  /** Outgoing adjacency: source → targets. */
  private readonly out: Map<string, Set<string>>;

  private constructor(serviceIds: Set<string>, out: Map<string, Set<string>>) {
    this.serviceIds = serviceIds;
    this.out = out;
  }

  /**
   * Build a graph from in-memory ids + edges (no DB).
   * Unknown edge endpoints are added as nodes so fixtures stay concise.
   *
   * @param serviceIds - Explicit service ids (may be empty; edges still contribute nodes).
   * @param edges - Directed edges source → target.
   * @returns Assembled graph.
   */
  static fromData(
    serviceIds: Iterable<string>,
    edges: ReadonlyArray<ServiceEdge>
  ): DependencyGraph {
    const ids = new Set<string>();
    for (const id of serviceIds) ids.add(id);

    const out = new Map<string, Set<string>>();
    const ensure = (id: string) => {
      ids.add(id);
      if (!out.has(id)) out.set(id, new Set());
    };

    for (const id of ids) ensure(id);

    for (const edge of edges) {
      ensure(edge.sourceServiceId);
      ensure(edge.targetServiceId);
      out.get(edge.sourceServiceId)!.add(edge.targetServiceId);
    }

    return new DependencyGraph(ids, out);
  }

  /**
   * Transitive downstream set from `serviceId` (forward BFS).
   * Depth 0 = origin; multi-path nodes keep the minimum depth (BFS first visit).
   *
   * @param serviceId - Origin service. If absent from the graph, returns empty.
   * @returns Blast radius services (BFS discovery order) and depth map.
   */
  getBlastRadius(serviceId: string): BlastRadius {
    if (!this.serviceIds.has(serviceId)) {
      return { services: [], depth: new Map() };
    }

    const depth = new Map<string, number>();
    const services: string[] = [];
    const queue: string[] = [serviceId];
    depth.set(serviceId, 0);
    services.push(serviceId);

    for (let i = 0; i < queue.length; i++) {
      const current = queue[i]!;
      const currentDepth = depth.get(current)!;
      const nexts = this.out.get(current);
      if (!nexts) continue;

      for (const next of nexts) {
        // Unweighted BFS: first visit is the minimum depth (handles diamonds safely).
        if (depth.has(next)) continue;
        depth.set(next, currentDepth + 1);
        services.push(next);
        queue.push(next);
      }
    }

    return { services, depth };
  }

  /**
   * Find directed cycles via iterative DFS with an explicit path stack.
   * Each cycle is returned as an ordered path of service ids that starts and
   * ends on the repeated node (e.g. [A, B, C, A]).
   *
   * @returns All distinct cycles discovered (one representative path each).
   * @sideEffects None — read-only over in-memory adjacency.
   */
  detectCycles(): string[][] {
    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map<string, number>();
    for (const id of this.serviceIds) color.set(id, WHITE);

    const cycles: string[][] = [];
    const seenCycleKeys = new Set<string>();

    /**
     * Canonicalize a cycle path so rotations/duplicates collapse to one key.
     * @param path - Cycle including repeated start/end node.
     */
    const cycleKey = (path: string[]): string => {
      const body = path.slice(0, -1);
      if (body.length === 0) return "";
      let minIdx = 0;
      for (let i = 1; i < body.length; i++) {
        if (body[i]! < body[minIdx]!) minIdx = i;
      }
      const rotated = body.slice(minIdx).concat(body.slice(0, minIdx));
      return rotated.join(">");
    };

    type Frame = {
      node: string;
      iterator: Iterator<string>;
    };

    for (const start of this.serviceIds) {
      if (color.get(start) !== WHITE) continue;

      const pathStack: string[] = [];
      const onStack = new Set<string>();
      const frames: Frame[] = [];

      color.set(start, GRAY);
      pathStack.push(start);
      onStack.add(start);
      frames.push({
        node: start,
        iterator: (this.out.get(start) ?? new Set()).values(),
      });

      while (frames.length > 0) {
        const frame = frames[frames.length - 1]!;
        const next = frame.iterator.next();

        if (next.done) {
          color.set(frame.node, BLACK);
          onStack.delete(frame.node);
          pathStack.pop();
          frames.pop();
          continue;
        }

        const neighbor = next.value as string;
        const neighborColor = color.get(neighbor) ?? WHITE;

        if (neighborColor === GRAY && onStack.has(neighbor)) {
          const idx = pathStack.indexOf(neighbor);
          if (idx >= 0) {
            const cyclePath = pathStack.slice(idx).concat(neighbor);
            const key = cycleKey(cyclePath);
            if (key && !seenCycleKeys.has(key)) {
              seenCycleKeys.add(key);
              cycles.push(cyclePath);
            }
          }
          continue;
        }

        if (neighborColor === WHITE) {
          color.set(neighbor, GRAY);
          pathStack.push(neighbor);
          onStack.add(neighbor);
          frames.push({
            node: neighbor,
            iterator: (this.out.get(neighbor) ?? new Set()).values(),
          });
        }
      }
    }

    return cycles;
  }

  /**
   * Expose outgoing neighbors for tests / callers composing on the adjacency list.
   * @param serviceId - Source node.
   * @returns Readonly set of target ids (empty if none).
   */
  neighbors(serviceId: string): ReadonlySet<string> {
    return this.out.get(serviceId) ?? new Set();
  }
}

/**
 * Load Service + ServiceDependency rows and assemble an in-memory graph.
 * With no orgId: loads ALL services/edges. With orgId: filters by that column
 * only (optional/unenforced multi-tenant — null org rows are excluded when filtering).
 *
 * @param orgId - Optional organization filter.
 * @param loader - Optional data source (tests/benchmarks). Defaults to Prisma loader.
 * @returns Assembled DependencyGraph.
 * @sideEffects Reads Service and ServiceDependency via Prisma when using default loader.
 */
export async function buildGraph(
  orgId?: string,
  loader?: DependencyGraphLoader
): Promise<DependencyGraph> {
  const resolved =
    loader ??
    (await import("./dependency-graph-db")).defaultDependencyGraphLoader;
  const [services, edges] = await Promise.all([
    resolved.loadServices(orgId),
    resolved.loadEdges(orgId),
  ]);
  return DependencyGraph.fromData(
    services.map((s) => s.id),
    edges
  );
}
