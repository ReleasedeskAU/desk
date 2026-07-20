import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateAppLinks,
  buildAppFocus,
  buildFocusFlowGraph,
  buildFullFlowGraph,
  connectionCountsByApp,
  listApplications,
  visualMapNodeId,
} from "./system-mapping-visual";
import type { MappingEdgeRow } from "./system-mapping-types";

function edge(
  sourceApp: string,
  sourceEnv: string,
  targetApp: string,
  targetEnv: string,
  direction = "downstream"
): MappingEdgeRow {
  return {
    sourceAppId: "a",
    sourceEnvId: "b",
    targetAppId: "c",
    targetEnvId: "d",
    direction,
    sourceApp: { name: sourceApp },
    sourceEnv: { name: sourceEnv },
    targetApp: { name: targetApp },
    targetEnv: { name: targetEnv },
  };
}

describe("listApplications", () => {
  it("returns sorted unique app names", () => {
    const apps = listApplications([
      edge("Workday", "Test", "SAP", "Test"),
      edge("SAP", "UAT", "ServiceNow", "Test"),
    ]);
    assert.deepEqual(apps, ["SAP", "ServiceNow", "Workday"]);
  });
});

describe("aggregateAppLinks", () => {
  it("collapses multiple env edges into one app link", () => {
    const links = aggregateAppLinks([
      edge("SAP", "Test", "Workday", "Test"),
      edge("SAP", "UAT", "Workday", "UAT"),
    ]);
    assert.equal(links.length, 1);
    assert.equal(links[0].fromApp, "SAP");
    assert.equal(links[0].toApp, "Workday");
    assert.equal(links[0].count, 2);
    assert.equal(links[0].envPairs.length, 2);
  });

  it("normalizes upstream into a forward link", () => {
    const links = aggregateAppLinks([edge("SAP", "Test", "Workday", "Test", "upstream")]);
    assert.equal(links.length, 1);
    assert.equal(links[0].fromApp, "Workday");
    assert.equal(links[0].toApp, "SAP");
  });
});

describe("buildAppFocus", () => {
  it("splits neighbors into upstream and downstream", () => {
    const focus = buildAppFocus(
      [
        edge("Workday", "Test", "SAP", "Test"),
        edge("SAP", "Test", "ServiceNow", "Test"),
      ],
      "SAP"
    );
    assert.ok(focus);
    assert.equal(focus!.upstream.length, 1);
    assert.equal(focus!.upstream[0].fromApp, "Workday");
    assert.equal(focus!.downstream.length, 1);
    assert.equal(focus!.downstream[0].toApp, "ServiceNow");
  });

  it("returns null for unknown app", () => {
    assert.equal(buildAppFocus([edge("SAP", "Test", "Workday", "Test")], "Missing"), null);
  });
});

describe("connectionCountsByApp", () => {
  it("counts each side of a link", () => {
    const counts = connectionCountsByApp([edge("SAP", "Test", "Workday", "Test")]);
    assert.equal(counts.get("SAP"), 1);
    assert.equal(counts.get("Workday"), 1);
  });
});

describe("buildFocusFlowGraph", () => {
  it("places selected app with upstream and downstream neighbors", () => {
    const focus = buildAppFocus(
      [
        edge("Workday", "Test", "SAP", "Test"),
        edge("SAP", "Test", "ServiceNow", "Test"),
      ],
      "SAP"
    );
    assert.ok(focus);
    const graph = buildFocusFlowGraph(focus!);
    assert.equal(graph.nodes.length, 3);
    assert.equal(graph.edges.length, 2);
    assert.ok(graph.nodes.some((n) => n.role === "selected" && n.app === "SAP"));
    assert.ok(graph.nodes.some((n) => n.role === "upstream" && n.app === "Workday"));
    assert.ok(graph.nodes.some((n) => n.role === "downstream" && n.app === "ServiceNow"));
  });
});

describe("buildFullFlowGraph", () => {
  it("includes every app once and marks selection", () => {
    const edges = [
      edge("Workday", "Test", "SAP", "Test"),
      edge("SAP", "Test", "ServiceNow", "Test"),
    ];
    const graph = buildFullFlowGraph(edges, "SAP");
    assert.equal(graph.nodes.length, 3);
    assert.equal(graph.edges.length, 2);
    assert.equal(graph.nodes.find((n) => n.app === "SAP")?.role, "selected");
    assert.equal(visualMapNodeId("SAP S/4"), "app-sap-s-4");
  });
});
