/**
 * Detector output shown in the Option A / Option B prompt.
 * Keep this file free of server-only imports so the dialog can use it.
 */
export type ConflictFinding = {
  typeKey: string;
  release2Code: string;
  applicationName: string;
  departmentName: string;
  conflictingEnvironment: string;
  notes: string;
  conflictPeriod: string;
  /** Plain-English “what” for the Option A/B prompt. */
  summary: string;
};
