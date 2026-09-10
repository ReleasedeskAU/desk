/**
 * Run: npx tsx --test lib/ui-control-locators.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { controlLoc, fieldLoc, fieldLocIfId, locatorToken } from "@/lib/ui-control-locators";

describe("locatorToken", () => {
  it("builds snake_case from surface + camelCase control", () => {
    assert.equal(locatorToken("release_edit", "goLiveDate"), "release_edit_go_live_date");
  });

  it("sanitizes record codes for unique row ids", () => {
    assert.equal(locatorToken("release", "row_edit", "REL-0001"), "release_row_edit_rel_0001");
  });

  it("drops empty parts", () => {
    assert.equal(locatorToken("login", "", "submit"), "login_submit");
  });
});

describe("controlLoc / fieldLoc", () => {
  it("reuses the same token for id and data-test-id", () => {
    assert.deepEqual(controlLoc("login_submit"), {
      id: "login_submit",
      "data-test-id": "login_submit",
    });
  });

  it("sets name on fields, defaulting to the id token", () => {
    assert.deepEqual(fieldLoc("release_create_name"), {
      id: "release_create_name",
      name: "release_create_name",
      "data-test-id": "release_create_name",
    });
    assert.equal(fieldLoc("release_create_name", "name").name, "name");
  });

  it("fieldLocIfId returns locators only when id is a real string", () => {
    assert.equal(fieldLocIfId(undefined), undefined);
    assert.equal(fieldLocIfId(""), undefined);
    assert.deepEqual(fieldLocIfId("release_create_name"), fieldLoc("release_create_name"));
  });
});

describe("create/edit locator wiring", () => {
  const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it("release form uses surface prefixes and save locators", () => {
    const file = src("components/releases/ReleaseFormModal.tsx");
    assert.match(file, /locPrefix = isEdit \? "release_edit" : "release_create"/);
    assert.match(file, /controlLoc\(loc\("save"\)\)/);
    assert.match(file, /loc\("previous_status"\)/);
    assert.match(file, /loc\("duration_days"\)/);
  });

  it("list add and row edit use unique tokens", () => {
    assert.match(src("app/(main)/releases/ReleasesPageContent.tsx"), /release_list_add/);
    assert.match(src("app/(main)/releases/ReleasesPageContent.tsx"), /entity="release"/);
    assert.match(src("app/(main)/signoffs/SignoffsContent.tsx"), /signoff_list_add/);
    assert.match(src("app/(main)/signoffs/SignoffsContent.tsx"), /entity="signoff"/);
    assert.match(src("app/(main)/incidents/IncidentsContent.tsx"), /incident_list_add/);
  });

  it("related create forms tag save and a required field", () => {
    assert.match(src("components/conflicts/ConflictFormModal.tsx"), /conflict_create/);
    assert.match(src("components/incidents/IncidentFormModal.tsx"), /incident_create/);
    assert.match(src("components/incidents/IncidentFormModal.tsx"), /id=\{loc\("title"\)\}/);
    assert.match(src("components/signoffs/SignoffRecordModal.tsx"), /signoff_record/);
    assert.match(src("components/signoffs/SignoffRecordModal.tsx"), /fieldLoc\(loc\("decision"\)\)/);
  });
});
