/** Database-backed system catalog row. */
export type SystemRow = {
  id: string;
  system: string;
  department: string;
  type: string;
  integratesWith: string;
  dataFlow: string;
  keyDataExchanged: string;
  sourceOrder: number;
};

/** Department relationship matrix row. */
export type DepartmentMatrixRow = {
  id: string;
  fromDepartment: string;
  finance: string;
  hr: string;
  it: string;
  crm: string;
  manufacturing: string;
  logistics: string;
  legal: string;
  security: string;
};

/** Shared environment inventory row. */
export type SharedEnvironmentRow = {
  id: string;
  environmentCode: string;
  environmentType: string;
  sharedBy: string;
  capacity: string;
  bookingRequirement: string;
  conflictRisk: string;
  sourceOrder: number;
};

/** Release coordination critical path row. */
export type CriticalPathRow = {
  id: string;
  pathCode: string;
  name: string;
  upstreamSystems: string;
  downstreamSystems: string;
  coordinationRequirement: string;
  blackoutWindows: string;
  releaseManagerNotes: string;
  sourceOrder: number;
};

/** Persisted release manager note row. */
export type MappingNote = {
  id: string;
  content: string;
  sourceOrder: number;
};
