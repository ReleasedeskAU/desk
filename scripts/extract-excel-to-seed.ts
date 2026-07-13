/**
 * Extract clean seed JSON from ReleaseDesk_SampleData_V0.6_12072026.xlsx
 * Overwrites prisma/seed-data/*.json with real data rows only (docs stripped).
 *
 * Run: npx tsx scripts/extract-excel-to-seed.ts
 */
import fs from "fs";
import path from "path";
import XLSX from "xlsx";

const EXCEL = path.join(process.cwd(), "public", "ReleaseDesk_SampleData_V0.6_12072026.xlsx");
const OUT = path.join(process.cwd(), "prisma", "seed-data");

function rows(name: string): unknown[][] {
  const wb = XLSX.readFile(EXCEL);
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: false }) as unknown[][];
}

function S(v: unknown): string {
  return String(v ?? "").trim();
}

function extractById(sheet: string, idRe: RegExp, headerHint: RegExp): Record<string, string>[] {
  const data = rows(sheet);
  let hr = -1;
  let idc = -1;
  for (let i = 0; i < Math.min(40, data.length); i++) {
    const row = data[i].map(S);
    for (let c = 0; c < row.length; c++) {
      if (!headerHint.test(row[c])) continue;
      for (let j = i + 1; j < Math.min(i + 8, data.length); j++) {
        if (idRe.test(S(data[j][c]))) {
          hr = i;
          idc = c;
          break;
        }
      }
      if (hr >= 0) break;
    }
    if (hr >= 0) break;
  }
  if (hr < 0) throw new Error(`No header for ${sheet}`);
  const headers = data[hr].map(S);
  const out: Record<string, string>[] = [];
  for (let i = hr + 1; i < data.length; i++) {
    const id = S(data[i][idc]);
    if (!idRe.test(id)) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, ci) => {
      if (!h || /^RISK SCORING/i.test(h)) return;
      obj[h.replace(/:$/, "")] = S(data[i][ci]);
    });
    out.push(obj);
  }
  return out;
}

function extractUntilDoc(sheet: string, headerRow: number, stopIf?: (row: unknown[]) => boolean): Record<string, string>[] {
  const data = rows(sheet);
  const headers = data[headerRow].map(S);
  const out: Record<string, string>[] = [];
  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    const first = S(row[0]);
    if (!first && row.every((c) => !S(c))) continue;
    if (/QUICK\s*REFERENCE|FULL\s*DOCUMENTATION|📚|📖/i.test(first) || first.length > 100) break;
    if (stopIf?.(row)) break;
    const filled = row.map(S).filter(Boolean);
    if (filled.length < 2) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, ci) => {
      if (h) obj[h] = S(row[ci]);
    });
    out.push(obj);
  }
  return out;
}

/** Extract one contiguous table section and preserve its raw Excel header text/order. */
function extractSection(sheet: string, firstHeader: string): Record<string, string>[] {
  const data = rows(sheet);
  const headerRow = data.findIndex((row) => S(row[0]) === firstHeader);
  if (headerRow < 0) throw new Error(`No ${firstHeader} section in ${sheet}`);

  const rawHeaders = data[headerRow].map((value) => String(value ?? ""));
  while (rawHeaders.length && !S(rawHeaders[rawHeaders.length - 1])) rawHeaders.pop();

  const out: Record<string, string>[] = [];
  for (let i = headerRow + 1; i < data.length; i++) {
    if (!S(data[i][0])) break;
    const obj: Record<string, string> = {};
    rawHeaders.forEach((header, column) => {
      if (S(header)) obj[header] = S(data[i][column]);
    });
    out.push(obj);
  }
  return out;
}

function write(file: string, data: unknown) {
  const p = path.join(OUT, file);
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  try {
    fs.renameSync(tmp, p);
  } catch {
    fs.copyFileSync(tmp, p);
    fs.unlinkSync(tmp);
  }
  console.log(`Wrote ${file}: ${Array.isArray(data) ? data.length : "object"}`);
}

/** Named Reference Data catalog sections → ReferenceData { category, value, sortOrder }. */
type RefSectionSpec = {
  /** Match section title in column A (prefer name over duplicated section numbers). */
  titleRe: RegExp;
  category: string;
  /** Header cell for the value stored in ReferenceData.value */
  valueHeaderRe: RegExp;
};

const REFERENCE_DATA_SECTIONS: RefSectionSpec[] = [
  {
    titleRe: /ENVIRONMENT\s+CONFLICT\s+TYPES/i,
    category: "environment_conflict_type",
    valueHeaderRe: /^Conflict Type$/i,
  },
  {
    titleRe: /SIGN-OFF\s+STATUSES/i,
    category: "sign_off_status",
    valueHeaderRe: /^Display$/i,
  },
  {
    titleRe: /PLAN\s+STATUSES/i,
    category: "plan_status",
    valueHeaderRe: /^Display$/i,
  },
  {
    titleRe: /RELEASE\s+HEALTH\s+LEVELS/i,
    category: "release_health_level",
    valueHeaderRe: /^Display$/i,
  },
];

function extractReferenceDataSections(
  sheet: string,
  specs: RefSectionSpec[]
): { category: string; value: string; sortOrder: number }[] {
  const data = rows(sheet);
  const out: { category: string; value: string; sortOrder: number }[] = [];

  for (const spec of specs) {
    let titleRow = -1;
    for (let i = 0; i < data.length; i++) {
      if (spec.titleRe.test(S(data[i][0]))) {
        titleRow = i;
        break;
      }
    }
    if (titleRow < 0) {
      console.warn(`Reference Data section not found: ${spec.category}`);
      continue;
    }

    const headerRow = titleRow + 1;
    const headers = data[headerRow]?.map(S) ?? [];
    const valueCol = headers.findIndex((h) => spec.valueHeaderRe.test(h));
    if (valueCol < 0) {
      console.warn(`Value column not found for ${spec.category} (headers: ${headers.join(", ")})`);
      continue;
    }

    let sortOrder = 0;
    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i];
      const first = S(row[0]);
      // Next numbered section heading ends this block
      if (/^\d+\.\s+\S/.test(first)) break;
      // Blank row after values → end of section
      if (!first && row.every((c) => !S(c))) {
        if (sortOrder > 0) break;
        continue;
      }
      const value = S(row[valueCol]);
      if (!value) continue;
      sortOrder += 1;
      out.push({ category: spec.category, value, sortOrder });
    }
  }

  return out;
}

function main() {
  // Releases — key order matches V0.6 "Releases" sheet left-to-right exactly
  write(
    "releases.json",
    extractById("Releases", /^REL-\d+/i, /release\s*id/i).map((r) => ({
      "Release ID": r["Release ID"],
      "Release Name": r["Release Name"],
      Department: r.Department,
      Application: r.Application,
      "External Dependencies ": r["External Dependencies"] || "",
      "Release Size": r["Release Size"],
      Impact: r.Impact,
      Priority: r.Priority,
      "CAB Date": r["CAB Date"],
      "Start Date": r["Start Date"],
      "End Date": r["End Date"],
      "Test Env Required": r["Test Env Required"],
      "UAT Env Required": r["UAT Env Required"],
      Status: r.Status,
      "Release Health": r["Release Health"] || "",
      "Conflict Flag": r["Conflict Flag"],
      "Conflict ID": r["Conflict ID"] || "",
      "Conflicting Release": r["Conflicting Release"] || "",
      "Conflict Type": r["Conflict Type"] || "",
      "Conflict Notes": r["Conflict Notes"] || "",
      Blockers: r.Blockers,
      "Change Freeze": r["Change Freeze"],
      "Vendor Maintenance": r["Vendor Maintenance"],
      "Rollback Plan": r["Rollback Plan"],
      "Readiness %": r["Readiness %"],
      "Go-Live Checklist %": r["Go-Live Checklist %"],
      "Release Owner ID": r["Release Owner ID"],
      "Approval Status": r["Approval Status"],
      "Stakeholder IDs": r["Stakeholder IDs"],
      "Depends On Other releases": r["Depends On Other releases"] || r["Depends On"] || "",
      Regulatory: r.Regulatory,
      "Deployment Window": r["Deployment Window"],
      "Dev Signoff": r["Dev Signoff"] || "",
      "Test Sign-off": r["Test Sign-off"] || "",
      "UAT Sign-off": r["UAT Sign-off"] || "",
      "Security Clearance": r["Security Clearance"] || "",
      "Dress Rehearsal": r["Dress Rehearsal"] || "",
      "Hypercare Plan": r["Hypercare Plan"] || "",
      "Comms Plan": r["Comms Plan"] || "",
      "Training Status": r["Training Status"] || "",
    }))
  );

  // Calendar
  write(
    "calendar.json",
    extractUntilDoc("Calendar", 13).map((r) => ({
      Month: r.Month,
      Week: Number(r.Week) || r.Week,
      Date: r.Date,
      Day: r.Day,
      "Event Type": r["Event Type"],
      "Release ID": r["Release ID"],
      "Release Name": r["Release Name"],
      Application: r.Application || "",
      Department: r.Department,
      "Size/Impact": r["Size/Impact"],
      Notes: r.Notes,
    }))
  );

  // Env booking — ID rows only
  write(
    "env_booking.json",
    extractById("Env booking", /^ENV-\d+/i, /booking\s*id/i).map((r) => ({
      "Booking ID": r["Booking ID"],
      "Release ID": r["Release ID"],
      Application: r.Application,
      Department: r.Department,
      Dependencies: r.Dependencies || "",
      "Release Size": r["Release Size"],
      "Prod Release Date": r["Prod Release Date"],
      "CAB Date": r["CAB Date"],
      "Test Env": r["Test Env"],
      "Test Start": r["Test Start"],
      "Test End": r["Test End"],
      "Test Days": r["Test Days"],
      "UAT Env": r["UAT Env"],
      "UAT Start": r["UAT Start"],
      "UAT End": r["UAT End"],
      "UAT Days": r["UAT Days"],
      "Pre-Prod Env": r["Pre-Prod Env"],
      "Pre-Prod Start": r["Pre-Prod Start"],
      "Pre-Prod End": r["Pre-Prod End"],
      "Pre-Prod Days": r["Pre-Prod Days"],
      "Conflict Flag": r["Conflict Flag"],
      Notes: r.Notes,
      "Environment Conflict ID": r["Environment Conflict ID"] || "",
    }))
  );

  write("conflicts.json", extractById("Environment Conflicts", /^CNF-\d+/i, /conflict\s*id/i));
  write("blockers.json", extractSection("Blockers", "Blocker ID"));
  write("system-core.json", extractSection("System Mapping", "System"));
  write("system-matrix.json", extractSection("System Mapping", "From \\ To"));
  write("integration-flows.json", extractSection("System Mapping", "Flow ID"));

  write(
    "risk.json",
    extractById("Risk", /^RSK-\d+/i, /risk\s*id/i).map((r) => ({
      "Risk ID": r["Risk ID"],
      "Release ID": r["Release ID"],
      "Release Name": r["Release Name"],
      Application: r.Application || "",
      Department: r.Department || "",
      "Prod Date": r["Prod Date"],
      "Days Out": r["Days Out"],
      "Risk Category": r["Risk Category"],
      "Risk Description": r["Risk Description"],
      Likelihood: r.Likelihood,
      Impact: r.Impact,
      "Risk Score": r["Risk Score"],
      "Affected Area": r["Affected Area"],
      "Mitigation Strategy": r["Mitigation Strategy"],
      "Risk Owner": r["Risk Owner"],
      Status: r.Status,
      Notes: r.Notes,
      "Risk Owner ID": r["Risk Owner ID"],
    }))
  );

  write(
    "drift.json",
    extractById("Drift", /^DFT-\d+/i, /drift\s*id/i).map((r) => ({
      "Drift ID": r["Drift ID"],
      "Release ID": r["Release ID"],
      "Release Name": r["Release Name"],
      Application: r.Application,
      Department: r.Department || "",
      Environment: r.Environment,
      "Drift Type:": r["Drift Type"] || r["Drift Type:"],
      "Drift Category": r["Drift Category"],
      "Detected Date": r["Detected Date"],
      Severity: r.Severity,
      Description: r.Description,
      "Impact on Release": r["Impact on Release"],
      "Remediation Action": r["Remediation Action"],
      Status: r.Status,
      "ETA to Fix": r["ETA to Fix"],
    }))
  );

  write("dependencies.json", extractById("Dependencies", /^DEP-\d+/i, /dep\s*id/i));

  write(
    "approvals.json",
    extractById("Approvals", /^APR-\d+/i, /approval\s*id/i).map((r) => ({
      "Approval ID": r["Approval ID"],
      "Release ID": r["Release ID"],
      "Release Name": r["Release Name"],
      Application: r.Application || "",
      Department: r.Department || "",
      "Approval Type": r["Approval Type"],
      "Approver ID": r["Approver ID"],
      "Approver Name": r["Approver Name"],
      "Approver Role": r["Approver Role"],
      "Submitted Date": r["Submitted Date"],
      "Decision Date": r["Decision Date"],
      Decision: r.Decision,
      Comments: r.Comments,
      "CAB Meeting ID": r["CAB Meeting ID"],
    }))
  );

  write("leave_calendar.json", extractById("Leave Calendar", /^LV-\d+/i, /leave\s*id/i));
  write("incidents.json", extractById("Incidents", /^INC-\d+/i, /incident\s*id/i));
  write("monitoring-alerts.json", extractById("Monitoring Alerts", /^ALT-\d+/i, /alert\s*id/i));
  write("planned-maintenance.json", extractById("Planned Maintenance", /^MNT-\d+/i, /maintenance\s*id/i));

  // Application Status — until docs
  write("application-status.json", extractUntilDoc("Application Status", 0));

  // Versions
  write("versions.json", extractUntilDoc("Versions", 0, (row) => {
    const a = S(row[0]);
    return Boolean(a && !/^APP-/i.test(a) && a.length > 20);
  }));

  // Users — email rows only (Users sheet; keep RM/SA separate)
  {
    const data = rows("Users");
    const headers = data[0].map(S);
    const out: Record<string, string>[] = [];
    for (let i = 1; i < data.length; i++) {
      const email = S(data[i][2]);
      if (!email.includes("@")) {
        if (out.length) break;
        continue;
      }
      const obj: Record<string, string> = {};
      headers.forEach((h, ci) => {
        if (h) obj[h] = S(data[i][ci]);
      });
      out.push(obj);
    }
    write("users.json", out);
  }

  // Applications — group by app name (Department/Owner/TechLead carry forward)
  {
    const data = rows("Applications");
    const byApp = new Map<string, any>();
    let lastDept = "";
    let lastOwner = "";
    let lastTech = "";
    for (let i = 1; i < data.length; i++) {
      const dept = S(data[i][0]) || lastDept;
      const app = S(data[i][1]);
      const env = S(data[i][2]);
      const owner = S(data[i][3]) || lastOwner;
      const tech = S(data[i][4]) || lastTech;
      if (!app || /QUICK|FULL|📚/i.test(app) || app.length > 80) break;
      if (S(data[i][0])) lastDept = dept;
      if (S(data[i][3])) lastOwner = owner;
      if (S(data[i][4])) lastTech = tech;
      if (!byApp.has(app)) {
        byApp.set(app, {
          department: dept,
          application: app,
          applicationOwner: owner,
          techLead: tech,
          environments: [] as { env: string; envOwner: string }[],
        });
      }
      const rec = byApp.get(app)!;
      if (env) rec.environments.push({ env, envOwner: S(data[i][5]) });
    }
    write("applications.json", [...byApp.values()]);
  }

  // Departments from Reference Data section
  {
    const data = rows("Reference Data");
    const depts: { name: string; code?: string; id?: string }[] = [];
    let inDept = false;
    for (let i = 0; i < data.length; i++) {
      const a = S(data[i][0]);
      if (/^1\.\s*DEPARTMENTS/i.test(a) || a === "1. DEPARTMENTS") {
        inDept = true;
        continue;
      }
      if (inDept && /^2\.\s*/.test(a)) break;
      if (inDept && /^DEPT-/i.test(a)) {
        depts.push({ id: a, code: S(data[i][1]), name: S(data[i][2]) });
      }
    }
    write(
      "departments.json",
      depts.map((d) => ({ name: d.name, code: d.code, deptId: d.id }))
    );
  }

  // ReferenceData catalog — V0.6 sections 17–20 (matched by title, not section number)
  write("reference_data.json", extractReferenceDataSections("Reference Data", REFERENCE_DATA_SECTIONS));

  // Risk factors — rows under Category|Factor Name|Weight until WEIGHT SUMMARY
  {
    const data = rows("Risk Factors");
    let hr = -1;
    for (let i = 0; i < 20; i++) {
      const row = data[i].map(S);
      if (row[0] === "Category" && /factor\s*name/i.test(row[1])) {
        hr = i;
        break;
      }
    }
    if (hr < 0) throw new Error("Risk Factors header not found");
    const out: Record<string, string | number>[] = [];
    let lastCategory = "";
    for (let i = hr + 1; i < data.length; i++) {
      const row = data[i].map(S);
      if (/^WEIGHT\s+SUMMARY/i.test(row[0])) break;
      if (/QUICK|FULL\s*DOCUMENTATION|📚|📖/i.test(row[0])) break;
      let category = row[0];
      const factorName = row[1];
      const weightRaw = row[2];
      if (category) lastCategory = category;
      else category = lastCategory;
      if (!category || !factorName || !weightRaw) continue;
      if (!/%/.test(weightRaw) && !/^\d+(\.\d+)?$/.test(weightRaw)) continue;
      const w = Number(String(weightRaw).replace("%", ""));
      if (!Number.isFinite(w)) continue;
      out.push({
        Category: category,
        "Factor Name": factorName,
        Weight: w > 1 ? w / 100 : w,
        Description: row[3] || "",
        "Score 1 (Best)": row[4] || "",
        "Score 5 (Worst)": row[5] || "",
        "Data Source": row[6] || "",
      });
    }
    write("risk_factors.json", out);
  }

  // Admin / Super Admins (no schema target — keep as reference files)
  {
    const rm = extractUntilDoc("Admin (Release Managers)", 0);
    write("release_managers_NO_SCHEMA_TARGET.json", rm);
    const saData = rows("Super Admins");
    const saHeaders = saData[0].map(S);
    const sa: Record<string, string>[] = [];
    for (let i = 1; i < saData.length; i++) {
      const id = S(saData[i][0]);
      if (!/^SA-/i.test(id)) break;
      const obj: Record<string, string> = {};
      saHeaders.forEach((h, ci) => {
        if (h) obj[h] = S(saData[i][ci]);
      });
      sa.push(obj);
    }
    write("super_admins_NO_SCHEMA_TARGET.json", sa);
  }

  console.log("Done.");
}

main();
