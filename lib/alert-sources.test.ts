import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALERT_SOURCES,
  alertSourceOptions,
  isAlertSource,
} from "@/lib/alert-sources";

describe("alert sources", () => {
  it("accepts the eight sheet sources and rejects leftovers", () => {
    assert.equal(ALERT_SOURCES.length, 8);
    assert.equal(isAlertSource("Manual"), true);
    assert.equal(isAlertSource("System"), true);
    assert.equal(isAlertSource("Risk Threshold"), true);
    assert.equal(isAlertSource("cpu_usage"), false);
    assert.equal(isAlertSource(""), false);
  });

  it("keeps an unknown current value visible in the select", () => {
    const options = alertSourceOptions("cpu_usage");
    assert.ok(options.some((option) => option.value === "Manual"));
    assert.ok(options.some((option) => option.value === "cpu_usage"));
  });
});
