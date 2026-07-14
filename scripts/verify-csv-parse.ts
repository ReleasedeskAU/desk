/**
 * Prove parseCsvText handles quoted commas / escapes — the bug naive line.split(",") misses.
 */
import assert from "node:assert/strict";
import { MAX_CSV_BYTES, MAX_CSV_ROWS, parseCsvText } from "../lib/csv-parse";

assert.equal(MAX_CSV_BYTES, 2 * 1024 * 1024, "size cap retained");
assert.equal(MAX_CSV_ROWS, 5_000, "row cap retained");

const simple = parseCsvText("Name,Head\nFinance,Alex Rivera\n");
assert.deepEqual(simple[0], ["Name", "Head"]);
assert.deepEqual(simple[1], ["Finance", "Alex Rivera"]);

// Quoted field with embedded comma — naive split would produce 3 cells
const quoted = parseCsvText('Name,Head\n"Finance, Corp","Rivera, Alex"\n');
assert.equal(quoted.length, 2);
assert.deepEqual(quoted[1], ["Finance, Corp", "Rivera, Alex"], "quoted commas stay in one cell");

// Escaped quotes
const escaped = parseCsvText('Name,Notes\n"Acme ""Inc""","He said ""hi"""\n');
assert.deepEqual(escaped[1], ['Acme "Inc"', 'He said "hi"'], "escaped quotes parsed");

// Naive split would wrongly split this into more columns
const naiveWouldBreak = 'Dept,Owner\n"Risk, Compliance & Legal",Sam\n';
const rows = parseCsvText(naiveWouldBreak);
assert.equal(rows[1].length, 2, "embedded comma does not create extra columns");
assert.equal(rows[1][0], "Risk, Compliance & Legal");
assert.equal(rows[1][1], "Sam");

console.log("PASS: CSV parser — quoted commas/escapes (not naive split)");
