import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  lookupIncludeQueryForPath,
  parseLookupInclude,
} from "./release-lookup-scope";

describe("parseLookupInclude", () => {
  it("defaults to the full payload when include is omitted", () => {
    assert.deepEqual(parseLookupInclude(null), {
      directories: true,
      bookings: true,
      releases: true,
      calendar: true,
    });
    assert.deepEqual(parseLookupInclude(""), {
      directories: true,
      bookings: true,
      releases: true,
      calendar: true,
    });
  });

  it("honours an allowlisted subset", () => {
    assert.deepEqual(parseLookupInclude("directories,releases"), {
      directories: true,
      bookings: false,
      releases: true,
      calendar: false,
    });
  });

  it("treats calendarEvents as calendar and ignores unknown tokens", () => {
    const parsed = parseLookupInclude("calendarEvents,bogus");
    assert.equal(parsed.calendar, true);
    assert.equal(parsed.directories, false);
  });

  it("fails closed on oversized include strings", () => {
    assert.deepEqual(parseLookupInclude("directories,".repeat(40)), {
      directories: false,
      bookings: false,
      releases: false,
      calendar: false,
    });
  });
});

describe("lookupIncludeQueryForPath", () => {
  it("loads full list data only on list pages", () => {
    assert.equal(
      lookupIncludeQueryForPath("/releases"),
      "directories,bookings,releases"
    );
    assert.equal(
      lookupIncludeQueryForPath("/calendar?period=week"),
      "directories,bookings,releases,calendar"
    );
    assert.equal(lookupIncludeQueryForPath("/inbox"), "directories");
  });

  it("skips lookups on dashboard, settings, and release detail", () => {
    assert.equal(lookupIncludeQueryForPath("/dashboard"), null);
    assert.equal(lookupIncludeQueryForPath("/releases/abc"), null);
    assert.equal(lookupIncludeQueryForPath("/settings/lifecycle"), null);
  });
});
