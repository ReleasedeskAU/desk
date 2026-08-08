import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Package,
  Calendar,
  History,
  Plug,
  Settings,
  Bot,
  LineChart,
  Briefcase,
  Share2,
  Columns2,
  Server,
  CalendarCheck,
  GitBranch,
  Workflow,
  Database,
  Inbox,
  AlertTriangle,
  GitCompareArrows,
  ClipboardCheck,
  CalendarOff,
  Network,
  AlertOctagon,
  Ban,
  Building2,
  UserCircle,
  Bell,
  HeartPulse,
  CalendarClock,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  pulse?: boolean;
};

export type NavSection = {
  title?: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/inbox", label: "Morning Inbox", icon: Inbox, pulse: true },
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "Release Desk",
    items: [
      { href: "/releases", label: "Releases", icon: Package },
      { href: "/calendar", label: "Calendar", icon: Calendar },
      { href: "/booking", label: "Env Booking", icon: CalendarCheck },
      { href: "/dependencies", label: "Dependencies", icon: Network },
      { href: "/conflicts", label: "Conflicts", icon: AlertOctagon },
      { href: "/blockers", label: "Blockers", icon: Ban },
      { href: "/system-mapping", label: "System Mapping", icon: GitBranch },
      { href: "/integration-flows", label: "Integration Flows", icon: Workflow },
      { href: "/environments", label: "Versions & Config", icon: Server },
    ],
  },
  {
    title: "Governance",
    items: [
      { href: "/risks", label: "Risk", icon: AlertTriangle },
      { href: "/drifts", label: "Drift Dashboard", icon: GitCompareArrows },
      { href: "/approvals", label: "Approval Queue", icon: ClipboardCheck },
      { href: "/leaves", label: "Leave Calendar", icon: CalendarOff },
    ],
  },
  {
    title: "Monitoring",
    items: [
      { href: "/monitoring-alerts", label: "Monitoring Alerts", icon: Bell },
      { href: "/incidents", label: "Incidents", icon: AlertOctagon },
      { href: "/application-status", label: "Application Status", icon: HeartPulse },
      { href: "/planned-maintenance", label: "Planned Maintenance", icon: CalendarClock },
    ],
  },
  {
    title: "Portfolio",
    items: [
      { href: "/executive", label: "Executive", icon: Briefcase },
      { href: "/compare", label: "Compare", icon: Columns2 },
      { href: "/insights", label: "Insights", icon: LineChart },
    ],
  },
  {
    title: "Master Data",
    items: [
      { href: "/departments", label: "Departments", icon: Building2 },
      { href: "/applications", label: "Applications", icon: Package },
      { href: "/users", label: "Users", icon: UserCircle },
      { href: "/risk-factors", label: "Risk Factors", icon: AlertTriangle },
    ],
  },
  {
    title: "Lifecycle",
    items: [
      { href: "/lifecycle", label: "Lifecycle Settings", icon: GitBranch },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/knowledge-graph", label: "Knowledge Graph", icon: Share2 },
      { href: "/agents", label: "Agents", icon: Bot, pulse: true },
      { href: "/history", label: "History Log", icon: History },
      { href: "/connectors", label: "Connectors", icon: Plug },
      { href: "/admin/reference-data", label: "Reference Data", icon: Database },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);
