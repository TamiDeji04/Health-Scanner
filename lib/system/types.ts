// ─── Status & Category Types ────────────────────────────────────────────────

export type Status = 'normal' | 'warning' | 'critical';
export type Category = 'cpu' | 'memory' | 'disk';

// ─── Core Data Types ────────────────────────────────────────────────────────

/**
 * A single metric reading from a system scan.
 * Represents one data point like "CPU Usage: 45%"
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
 * Represents an issue or warning discovered during threshold evaluation.
 */
export interface HealthFlag {
  category: Category;
  severity: Status;
  message: string;
}

/**
 * Complete scan output — the full picture of a single health check.
 * Contains all metrics, flags, and metadata from one scan execution.
 */
export interface ScanResult {
  id: string;
  timestamp: string;
  hostname: string;
  platform: string;
  overallStatus: Status;
  metrics: MetricSnapshot[];
  flags: HealthFlag[];
}

/**
 * Lightweight scan summary for history lists.
 * Used in the dashboard sidebar and scan history to avoid loading full results.
 */
export interface ScanSummary {
  id: string;
  timestamp: string;
  overallStatus: Status;
  hostname: string;
}
