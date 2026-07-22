/**
 * Fixture + performance tests for Copilot P1-S2 DependencyGraph.
 * Pure in-memory — no live database.
 * Run: npx tsx --test lib/copilot/dependency-graph.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CycleError } from "./errors";
import {
  DependencyGraph,
  buildGraph,
  type DependencyGraphLoader,
  type ServiceEdge,
} from "./dependency-graph";
import {
  calculateDeploymentOrder,
  getBlockedReleases,
  type ReleaseLinkIndex,
} from "./dependency-graph-orders";
import {
  isReleaseDependencyUnmet,
  projectServicesInvolved,
} from "./release-services";

describe("DependencyGraph fixtures", () => {
  it("linear chain A → B → C: blast radius depths are 0,1,2", () => {
    const g = DependencyGraph.fromData(["A", "B", "C"], [
      { sourceServiceId: "A", targetServiceId: "B" },
      { sourceServiceId: "B", targetServiceId: "C" },
    ]);
    const { services, depth } = g.getBlastRadius("A");
    assert.deepEqual([...services].sort(), ["A", "B", "C"]);
    assert.equal(depth.get("A"), 0);
    assert.equal(depth.get("B"), 1);
    assert.equal(depth.get("C"), 2);
    process.stdout.write(
      `PROOF linear blast(A)=${JSON.stringify(Object.fromEntries(depth))}\n`
    );
  });

  it("diamond A→B, A→C, B→D, C→D: D has depth 2 (min over both paths)", () => {
    // Hand-computed: A--1-->B--1-->D and A--1-->C--1-->D ⇒ depth(D)=2, not ambiguous.
    const g = DependencyGraph.fromData(["A", "B", "C", "D"], [
      { sourceServiceId: "A", targetServiceId: "B" },
      { sourceServiceId: "A", targetServiceId: "C" },
      { sourceServiceId: "B", targetServiceId: "D" },
      { sourceServiceId: "C", targetServiceId: "D" },
    ]);
    const { services, depth } = g.getBlastRadius("A");
    assert.deepEqual([...services].sort(), ["A", "B", "C", "D"]);
    assert.equal(depth.get("A"), 0);
    assert.equal(depth.get("B"), 1);
    assert.equal(depth.get("C"), 1);
    assert.equal(depth.get("D"), 2);
    process.stdout.write(
      `PROOF diamond depth(D)=${depth.get("D")} services=${JSON.stringify(services)}\n`
    );
  });

  it("3-node cycle: detectCycles returns an ordered path array", () => {
    const g = DependencyGraph.fromData(["A", "B", "C"], [
      { sourceServiceId: "A", targetServiceId: "B" },
      { sourceServiceId: "B", targetServiceId: "C" },
      { sourceServiceId: "C", targetServiceId: "A" },
    ]);
    const cycles = g.detectCycles();
    assert.equal(cycles.length, 1);
    const path = cycles[0]!;
    // Ordered cycle path closes on the repeated node.
    assert.ok(path.length >= 4, `expected closed path, got ${JSON.stringify(path)}`);
    assert.equal(path[0], path[path.length - 1]);
    const body = path.slice(0, -1);
    assert.deepEqual([...body].sort(), ["A", "B", "C"]);
    // Consecutive edges must exist in the fixture.
    const edgeSet = new Set(["A>B", "B>C", "C>A"]);
    for (let i = 0; i < path.length - 1; i++) {
      assert.ok(
        edgeSet.has(`${path[i]}>${path[i + 1]}`),
        `missing edge ${path[i]}→${path[i + 1]} in ${JSON.stringify(path)}`
      );
    }
    process.stdout.write(`PROOF detectCycles path=${JSON.stringify(path)}\n`);
  });

  it("disconnected components: blast radius stays inside one component", () => {
    const g = DependencyGraph.fromData(["A", "B", "X", "Y"], [
      { sourceServiceId: "A", targetServiceId: "B" },
      { sourceServiceId: "X", targetServiceId: "Y" },
    ]);
    const fromA = g.getBlastRadius("A");
    assert.deepEqual([...fromA.services].sort(), ["A", "B"]);
    assert.equal(fromA.depth.has("X"), false);
    assert.equal(fromA.depth.has("Y"), false);

    const fromX = g.getBlastRadius("X");
    assert.deepEqual([...fromX.services].sort(), ["X", "Y"]);
    assert.equal(g.detectCycles().length, 0);
  });

  it("empty graph: zero services, empty blast and cycles", () => {
    const g = DependencyGraph.fromData([], []);
    assert.equal(g.serviceIds.size, 0);
    const blast = g.getBlastRadius("missing");
    assert.deepEqual(blast.services, []);
    assert.equal(blast.depth.size, 0);
    assert.deepEqual(g.detectCycles(), []);
  });
});

describe("getBlockedReleases + calculateDeploymentOrder", () => {
  function indexFixture(): ReleaseLinkIndex {
    return {
      applicationByService: new Map([
        ["A", "app1"],
        ["B", "app1"],
        ["C", "app2"],
      ]),
      releasesByApplication: new Map([
        ["app1", ["rel_blocked", "rel_clean"]],
        ["app2", ["rel_unmet"]],
      ]),
      activeBlockerReleaseIds: new Set(["rel_blocked"]),
      dependenciesByRelease: new Map([
        ["rel_unmet", [{ status: "Open" }]],
        ["rel_clean", [{ status: "Resolved" }]],
      ]),
    };
  }

  it("getBlockedReleases returns only blast-radius releases that are blocked/unmet", () => {
    // A→B→C blast from A includes A,B,C → apps app1+app2 → all three releases,
    // but rel_clean is neither ACTIVE-blocker nor unmet.
    const g = DependencyGraph.fromData(["A", "B", "C"], [
      { sourceServiceId: "A", targetServiceId: "B" },
      { sourceServiceId: "B", targetServiceId: "C" },
    ]);
    const blocked = getBlockedReleases(g, "A", indexFixture());
    assert.deepEqual(blocked, ["rel_blocked", "rel_unmet"]);
    process.stdout.write(`PROOF getBlockedReleases(A)=${JSON.stringify(blocked)}\n`);
  });

  it("calculateDeploymentOrder: C before B before A when A→B→C (depends-on)", () => {
    const g = DependencyGraph.fromData(["A", "B", "C"], [
      { sourceServiceId: "A", targetServiceId: "B" },
      { sourceServiceId: "B", targetServiceId: "C" },
    ]);
    const order = calculateDeploymentOrder(
      g,
      ["rel_blocked", "rel_unmet"],
      indexFixture()
    );
    assert.deepEqual(order, ["C", "B", "A"]);
    process.stdout.write(`PROOF calculateDeploymentOrder=${JSON.stringify(order)}\n`);
  });

  it("calculateDeploymentOrder throws CycleError with ordered path", () => {
    const g = DependencyGraph.fromData(["A", "B", "C"], [
      { sourceServiceId: "A", targetServiceId: "B" },
      { sourceServiceId: "B", targetServiceId: "C" },
      { sourceServiceId: "C", targetServiceId: "A" },
    ]);
    assert.throws(
      () => calculateDeploymentOrder(g, ["rel_blocked", "rel_unmet"], indexFixture()),
      (err: unknown) => {
        assert.ok(err instanceof CycleError);
        assert.equal(err.code, "DEPENDENCY_CYCLE");
        assert.ok(Array.isArray(err.path));
        assert.equal(err.path[0], err.path[err.path.length - 1]);
        process.stdout.write(`PROOF CycleError.path=${JSON.stringify(err.path)}\n`);
        return true;
      }
    );
  });
});

describe("Services Involved empty + unmet helper", () => {
  it("projectServicesInvolved returns [] when release has no applications", () => {
    const rows = projectServicesInvolved(
      [],
      [
        {
          id: "svc1",
          name: "ShouldNotAppear",
          criticality: "HIGH",
          applicationId: "app1",
          applicationName: "App",
        },
      ]
    );
    assert.deepEqual(rows, []);
    process.stdout.write(
      "PROOF Services Involved empty (no apps): [] — not an error, not a fake row\n"
    );
  });

  it("projectServicesInvolved returns [] when apps exist but no services linked", () => {
    const rows = projectServicesInvolved(["app1"], []);
    assert.deepEqual(rows, []);
    process.stdout.write(
      "PROOF Services Involved empty (apps, zero services): []\n"
    );
  });

  it("isReleaseDependencyUnmet treats blank/open as unmet and Resolved as met", () => {
    assert.equal(isReleaseDependencyUnmet(null), true);
    assert.equal(isReleaseDependencyUnmet("Open"), true);
    assert.equal(isReleaseDependencyUnmet("Resolved"), false);
  });
});

describe("buildGraph loader + org filter", () => {
  it("loads ALL rows when orgId is omitted", async () => {
    const loader: DependencyGraphLoader = {
      async loadServices() {
        return [{ id: "s1" }, { id: "s2" }];
      },
      async loadEdges() {
        return [{ sourceServiceId: "s1", targetServiceId: "s2" }];
      },
    };
    const g = await buildGraph(undefined, loader);
    assert.deepEqual([...g.serviceIds].sort(), ["s1", "s2"]);
    assert.equal(g.getBlastRadius("s1").depth.get("s2"), 1);
  });

  it("passes orgId through to the loader when provided", async () => {
    const seen: string[] = [];
    const loader: DependencyGraphLoader = {
      async loadServices(orgId) {
        seen.push(`svc:${orgId ?? "none"}`);
        return [{ id: "only" }];
      },
      async loadEdges(orgId) {
        seen.push(`edge:${orgId ?? "none"}`);
        return [];
      },
    };
    await buildGraph("org_abc", loader);
    assert.deepEqual(seen, ["svc:org_abc", "edge:org_abc"]);
  });
});

describe("buildGraph performance (200 services / 600 edges)", () => {
  it("assembles synthetic graph in under 500ms (reports real ms)", async () => {
    const SERVICE_COUNT = 200;
    const EDGE_COUNT = 600;
    const serviceIds = Array.from({ length: SERVICE_COUNT }, (_, i) => `svc_${i}`);
    const edges: ServiceEdge[] = [];
    for (let i = 0; i < EDGE_COUNT; i++) {
      const source = serviceIds[i % SERVICE_COUNT]!;
      // Avoid self-edges; spread targets across the ring.
      const target = serviceIds[(i * 7 + 1) % SERVICE_COUNT]!;
      if (source === target) continue;
      edges.push({ sourceServiceId: source, targetServiceId: target });
    }
    // Top up if self-edge skips reduced count.
    let k = 0;
    while (edges.length < EDGE_COUNT) {
      const source = serviceIds[k % SERVICE_COUNT]!;
      const target = serviceIds[(k + 3) % SERVICE_COUNT]!;
      if (source !== target) {
        edges.push({ sourceServiceId: source, targetServiceId: target });
      }
      k += 1;
    }

    const loader: DependencyGraphLoader = {
      async loadServices() {
        return serviceIds.map((id) => ({ id }));
      },
      async loadEdges() {
        return edges.slice(0, EDGE_COUNT);
      },
    };

    const t0 = performance.now();
    const g = await buildGraph(undefined, loader);
    const elapsedMs = performance.now() - t0;

    assert.equal(g.serviceIds.size, SERVICE_COUNT);
    assert.ok(
      elapsedMs < 500,
      `buildGraph took ${elapsedMs.toFixed(2)}ms (limit 500ms)`
    );
    process.stdout.write(
      `buildGraph benchmark: ${SERVICE_COUNT} services / ${EDGE_COUNT} edges → ${elapsedMs.toFixed(2)}ms\n`
    );
  });
});
