import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapGithubRepoListPayload } from "./projects";
import { groupGithubReposByOwner, normalizeGithubRepo, parseGithubRepoSelection } from "./repos";

describe("normalizeGithubRepo", () => {
  it("accepts owner/name and strips a github.com URL", () => {
    assert.deepEqual(normalizeGithubRepo("acme/app"), { owner: "acme", name: "app", fullName: "acme/app" });
    assert.equal(normalizeGithubRepo("https://github.com/acme/app")?.fullName, "acme/app");
  });

  it("rejects missing slash, extra path, and unsafe names", () => {
    assert.equal(normalizeGithubRepo("no-slash"), null);
    assert.equal(normalizeGithubRepo("acme/app/extra"), null);
    assert.equal(normalizeGithubRepo("acme/.."), null);
  });
});

describe("parseGithubRepoSelection", () => {
  it("reads a single repo, a same-owner list, and all-repos for one owner", () => {
    assert.deepEqual(parseGithubRepoSelection({ repo: "acme/app" }), {
      owner: "acme",
      names: ["app"],
      allRepos: false,
    });
    assert.deepEqual(parseGithubRepoSelection({ repos: ["acme/app", "acme/api"] }), {
      owner: "acme",
      names: ["app", "api"],
      allRepos: false,
    });
    assert.deepEqual(parseGithubRepoSelection({ allRepos: true, repoOwner: "acme" }), {
      owner: "acme",
      names: [],
      allRepos: true,
    });
  });

  it("refuses mixed owners in one selection and a missing repo", () => {
    assert.throws(() => parseGithubRepoSelection({ repos: ["acme/app", "other/lib"] }), /repository/);
    assert.throws(() => parseGithubRepoSelection({}), /repository/);
  });
});

describe("groupGithubReposByOwner", () => {
  it("splits two owners into two connector selections", () => {
    const groups = groupGithubReposByOwner(["acme/app", "other/lib", "acme/api"]);
    assert.equal(groups.length, 2);
    assert.deepEqual(
      groups.find((g) => g.owner === "acme")?.names.sort(),
      ["api", "app"]
    );
    assert.deepEqual(groups.find((g) => g.owner === "other")?.names, ["lib"]);
  });
});

describe("mapGithubRepoListPayload", () => {
  it("reads full_name and skips malformed rows", () => {
    const mapped = mapGithubRepoListPayload([
      { full_name: "acme/app", name: "app", private: true },
      { full_name: "bad" },
    ]);
    assert.deepEqual(mapped, [{ fullName: "acme/app", name: "app", owner: "acme", private: true }]);
  });
});
