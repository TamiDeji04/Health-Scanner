// ─── Status & Category Types ────────────────────────────────────────────────

export type Status = 'normal' | 'warning' | 'critical';
export type Category = 'cpu' | 'memory' | 'disk';

// ─── Core Data Types ────────────────────────────────────────────────────────

/**
 * A single metric reading from a system scan.
 */
export interface MetricSnapshot {
  category: Category;
  label: string;
  value: number;
  unit: string;
  status: Status;
}

/**
 * A health flag raised during scan analysis.
 */
export interface HealthFlag {
  category: Category;
  severity: Status;
  message: string;
}

/**
 * Complete scan output — full picture of a single health check.
 * machineId is a stable identifier for the machine that submitted the scan.
 * For agent-pushed scans it is set by the agent; for server-run scans it
 * defaults to the hostname.
 */
export interface ScanResult {
  id: string;
  machineId: string;
  timestamp: string;
  hostname: string;
  platform: string;
  overallStatus: Status;
  metrics: MetricSnapshot[];
  flags: HealthFlag[];
}

/**
 * Lightweight scan summary for history lists.
 */
export interface ScanSummary {
  id: string;
  machineId: string;
  timestamp: string;
  overallStatus: Status;
  hostname: string;
}

/**
 * Registered machine info — stored so the dashboard can list all known machines.
 */
export interface MachineInfo {
  machineId: string;
  hostname: string;
  platform: string;
  lastSeen: string;
}
