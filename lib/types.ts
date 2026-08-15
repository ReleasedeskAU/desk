export type ApprovalGate = "QA" | "Security" | "Database" | "Business" | "Change";
export type ApprovalStatus = "Pending" | "Approved" | "Rejected";
export type BuildStatus = "Passed" | "Failed" | "Running" | "N/A";
export type ReleaseDecision = "Go" | "No-Go" | null;
export type ReleaseStatus = "Ready" | "At Risk" | "Blocked" | "Shipped" | "Scheduled";
export type ActivityType = "human" | "agent";
export type AgentRole =
  | "Ticket Agent"
  | "Build Agent"
  | "Approval Agent"
  | "Dependency Agent"
  | "Risk Agent"
  | "Summary Agent"
  | "Conversation Agent"
  | "Comms Agent"
  | "CAB Agent"
  | "Deploy Agent"
  | "Security Agent"
  | "SLO Agent"
  | "Runbook Agent";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
}

export interface Commit {
  sha: string;
  message: string;
  author: string;
  timestamp: string;
}

export interface Ticket {
  id: string;
  title: string;
  status: "Open" | "In Progress" | "Done" | "Blocked";
  assignee: string;
}

export interface Approval {
  gate: ApprovalGate;
  status: ApprovalStatus;
  approver?: string;
  timestamp?: string;
  pendingSince?: string;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  type: ActivityType;
  agent?: AgentRole;
}

export interface IncidentRecord {
  id: string;
  date: string;
  severity: "Sev-1" | "Sev-2" | "Sev-3";
  summary: string;
}

export type ChangeRiskTier = "Low" | "Medium" | "High" | "Critical";
export type CabVoteStatus = "Pending" | "Approved" | "Deferred" | "Rejected";

export interface ChangeRecord {
  crNumber: string;
  riskTier: ChangeRiskTier;
  scheduledStart: string;
  scheduledEnd: string;
  backoutPlan: string;
  affectedServices: string[];
  description: string;
  cabStatus: CabVoteStatus;
  cabSessionDate: string;
  submittedBy: string;
}

export interface CabSession {
  id: string;
  title: string;
  date: string;
  releaseIds: string[];
  chair: string;
  status: "Scheduled" | "In Progress" | "Completed";
}

export interface FreezeWindow {
  id: string;
  name: string;
  start: string;
  end: string;
  reason: string;
}

export type DeploymentPhase =
  | "Not Started"
  | "Scheduled"
  | "In Progress"
  | "Verifying"
  | "Verified"
  | "Rolled Back"
  | "Failed";

export type LifecycleStageId =
  | "planning"
  | "scheduling"
  | "testing"
  | "preparing"
  | "managing"
  | "deployment";

export type StageStatus = "complete" | "active" | "pending" | "blocked";

export interface LifecycleStageView {
  id: LifecycleStageId;
  label: string;
  status: StageStatus;
  detail: string;
}

export interface DeploymentSmokeTest {
  id: string;
  name: string;
  status: "Pending" | "Running" | "Passed" | "Failed";
}

export interface LiveMetricSnapshot {
  id: string;
  label: string;
  value: number;
  unit: string;
  threshold: number;
  status: "healthy" | "warning" | "critical";
}

export interface ReleaseDeploymentConfig {
  environment: string;
  cluster: string;
  pipeline: string;
  targetNamespace: string;
}

export interface DeploymentLiveState {
  phase: DeploymentPhase;
  rolloutPct: number;
  smokeTests: DeploymentSmokeTest[];
  metrics: LiveMetricSnapshot[];
  startedAt?: string;
  completedAt?: string;
  autoRollback?: boolean;
  rollbackReason?: string;
  rollbackNarrative?: string;
}

export type EnvironmentStage = "dev" | "staging" | "prod";
export type RegionCode = "us-east-1" | "eu-west-1" | "ap-southeast-2";

export interface EnvironmentPromotion {
  environment: EnvironmentStage;
  region: RegionCode;
  version: string;
  status: "live" | "deploying" | "pending" | "failed" | "rolled-back";
  deployedAt?: string;
}

export interface ReleaseDecisionRecord {
  decision: ReleaseDecision;
  rationale?: string;
  decidedAt: string;
  decidedBy: string;
  overridden?: boolean;
}

export interface AppNotification {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  releaseId?: string;
  read: boolean;
  type: "approval" | "build" | "cab" | "comms" | "decision" | "conflict";
  /** Deep link shown in the header inbox (e.g. /conflicts/CNF-0001). */
  href?: string;
  linkLabel?: string;
}

export interface Release {
  id: string;
  name: string;
  version: string;
  team: string;
  owner: string;
  targetDate: string;
  status: ReleaseStatus;
  decision: ReleaseDecision;
  filesChanged: number;
  typicalApprovalHours: Partial<Record<ApprovalGate, number>>;
  commits: Commit[];
  dependsOnServices: string[];
  incidentHistory: IncidentRecord[];
  tickets: Ticket[];
  approvals: Approval[];
  build: {
    id: string;
    status: BuildStatus;
    pipeline: string;
    lastRun: string;
    testCount: number;
    passedTests: number;
  };
  notes: string;
  history: HistoryEntry[];
  changeRecord?: ChangeRecord;
  deployment?: ReleaseDeploymentConfig;
  environmentPromotions?: EnvironmentPromotion[];
}

export interface Service {
  id: string;
  name: string;
  dependsOn: string[];
  criticality: "Critical" | "High" | "Medium" | "Low";
  recentIncidents: IncidentRecord[];
  unstable?: boolean;
}

export type ConnectorCategory =
  | "Issue Tracking"
  | "Source Control"
  | "CI/CD"
  | "Change Management"
  | "Monitoring"
  | "Incident"
  | "Security"
  | "Documentation"
  | "Communication"
  | "Deployment"
  | "Artifact Registry"
  | "Feature Flags"
  | "Secrets & Config";

export interface Connector {
  id: string;
  name: string;
  category: ConnectorCategory;
  description: string;
  status: "Connected" | "Disconnected" | "Error";
  lastSynced: string;
  maskedToken: string;
}

export interface AgentMeta {
  id: string;
  name: AgentRole;
  watches: string;
  description: string;
  tagline: string;
  accent: string;
  status: "Active" | "Paused";
  lastRanMinutesAgo: number;
  sparkline: number[];
  liveAi: boolean;
  sampleFindings: { text: string; releaseId?: string; timestamp: string }[];
}

export interface ActivityFeedItem {
  id: string;
  timestamp: string;
  type: ActivityType;
  actor: string;
  agent?: AgentRole;
  message: string;
  releaseId?: string;
}

export interface HistoricalTrendPoint {
  week: string;
  avgReadiness: number;
  rollbackCount: number;
}

export interface RiskFlag {
  title: string;
  explanation: string;
  severity: "low" | "medium" | "high";
  citations: string[];
}

export interface BuildExplanation {
  cause: string;
  suspectCommit: string;
  nextStep: string;
  citations: string[];
}

export interface DependencyWarning {
  warning: string;
  citations: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: string[];
}

export type KgNodeType = "release" | "service" | "person" | "ticket" | "change" | "incident";

export interface KgNode {
  id: string;
  type: KgNodeType;
  label: string;
  sublabel?: string;
  href?: string;
  meta?: Record<string, string>;
}

export interface KgEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface ReleasePrediction {
  releaseId: string;
  version: string;
  team: string;
  targetDate: string;
  shipSuccessPct: number;
  rollbackRiskPct: number;
  delayRiskPct: number;
  confidence: number;
  factors: { label: string; impact: number; direction: "up" | "down" }[];
  modelVersion: string;
}

export interface TeamRiskCell {
  team: string;
  riskScore: number;
  active: number;
  atRisk: number;
  blocked: number;
  avgReadiness: number;
}

export interface ForecastTrendPoint {
  week: string;
  actualReadiness?: number;
  predictedReadiness?: number;
  predictedRollbacks?: number;
  isForecast?: boolean;
}

export type EnterpriseDepartment = "FIN" | "HR" | "Security" | "Platform" | "CRM" | "Operations";
export type ReleaseSize = "high" | "medium" | "low";
export type ReleaseImpact = "high" | "medium" | "low";
export type EnvBookingStatus = "IDLE" | "BOOKED" | "MAINTENANCE";
export type EnterpriseEnvStage = "DEV" | "TEST" | "UAT" | "PROD";

export interface ReleaseTimelineEntry {
  id: string;
  name: string;
  department: EnterpriseDepartment;
  size: ReleaseSize;
  impact: ReleaseImpact;
  startDate: string;
  endDate: string;
  status: ReleaseStatus;
  releaseId?: string;
  version?: string;
  owner?: string;
  inFreezeWindow?: boolean;
  freezeWindowName?: string;
}

export interface EnvironmentDeskAlert {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  href?: string;
  actionLabel?: string;
}

export interface EnvBooking {
  id: string;
  system: string;
  month: string;
  monthIndex: number;
  status: EnvBookingStatus;
  team?: string;
  purpose?: string;
  contact?: string;
  releaseId?: string;
  version?: string;
  conflict?: boolean;
  conflictCount?: number;
}

export interface EnvBookingConflict {
  id: string;
  system: string;
  month: string;
  releaseIds: string[];
  teams: string[];
}

export interface TimelineFreezeOverlay {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface EnterpriseSystemNode {
  id: string;
  label: string;
  type: "environment" | "application";
  parentId?: string;
  serviceId?: string;
  status?: "healthy" | "warning" | "critical";
  version?: string;
  criticality?: string;
}

export interface ApplicationVersionRow {
  application: string;
  dev: string;
  test: string;
  prod: string;
  serviceIds: string[];
  drift: boolean;
  releaseId?: string;
  team?: string;
  promotionPct: number;
}

export interface ApplicationEnvConfig {
  application: string;
  environment: EnterpriseEnvStage;
  infra: string;
  firewall: string;
  networkZone: string;
  lastUpdated: string;
}

export interface ApplicationConfig {
  application: string;
  baseUrl: string;
  apiUrl: string;
  featureFlags: { name: string; enabled: boolean; environment: EnterpriseEnvStage }[];
  lastUpdated: string;
}

export type EnterpriseImpactCondition =
  | "queues paused"
  | "events paused"
  | "DB freezes"
  | "apps down"
  | "customer support down";

export interface EnterpriseReleaseImpact {
  releaseId: string;
  releaseName: string;
  version?: string;
  prerequisites: string[];
  conditions: EnterpriseImpactCondition[];
  active: boolean;
}

export interface EnvironmentDeskStats {
  timelineCount: number;
  bookedEnvs: number;
  versionDrift: number;
  activeImpacts: number;
  mappedServices: number;
  promotionGap: number;
  bookingConflicts: number;
  unhealthyServices: number;
  releasesInFreeze: number;
}

export interface EnvironmentDeskSnapshot {
  timeline: ReleaseTimelineEntry[];
  bookings: EnvBooking[];
  bookingConflicts: EnvBookingConflict[];
  freezeOverlays: TimelineFreezeOverlay[];
  alerts: EnvironmentDeskAlert[];
  systemNodes: EnterpriseSystemNode[];
  versions: ApplicationVersionRow[];
  envConfigs: ApplicationEnvConfig[];
  appConfigs: ApplicationConfig[];
  impacts: EnterpriseReleaseImpact[];
  stats: EnvironmentDeskStats;
}
