/**
 * Prove createRiskSchema enforces likelihood/impact ∈ [1,5] and rejects extras / unbounded values.
 */
import assert from "node:assert/strict";
import { createRiskSchema } from "../lib/validation/risk";

const base = {
  riskCode: "RSK-TEST",
  releaseId: "rel1",
  category: "Schedule",
  description: "Test risk",
};

assert.equal(createRiskSchema.safeParse({ ...base, likelihood: 1, impact: 5 }).success, true);
assert.equal(createRiskSchema.safeParse({ ...base, likelihood: 5, impact: 1 }).success, true);
assert.equal(createRiskSchema.safeParse({ ...base, likelihood: 3, impact: 3 }).success, true);

assert.equal(createRiskSchema.safeParse({ ...base, likelihood: 0, impact: 3 }).success, false, "likelihood 0 rejected");
assert.equal(createRiskSchema.safeParse({ ...base, likelihood: 6, impact: 3 }).success, false, "likelihood 6 rejected");
assert.equal(createRiskSchema.safeParse({ ...base, likelihood: 3, impact: 0 }).success, false, "impact 0 rejected");
assert.equal(createRiskSchema.safeParse({ ...base, likelihood: 3, impact: 99 }).success, false, "impact 99 rejected");
assert.equal(
  createRiskSchema.safeParse({ ...base, likelihood: 3, impact: 3, riskScore: 999 }).success,
  false,
  "client riskScore rejected (strict)"
);
assert.equal(
  createRiskSchema.safeParse({ ...base, likelihood: 3, impact: 3, extra: "nope" }).success,
  false,
  "unexpected field rejected"
);

const ok = createRiskSchema.parse({ ...base, likelihood: "4", impact: "2" });
assert.equal(ok.likelihood, 4);
assert.equal(ok.impact, 2);
assert.equal(ok.likelihood * ok.impact, 8, "score math 4×2=8 within 1–25 band");

console.log("PASS: risks POST Zod — likelihood/impact constrained to 1–5");
