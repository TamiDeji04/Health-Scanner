import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { ScanResult, ScanSummary, MetricSnapshot, HealthFlag, Status, Category } from './types';
import { getCollector } from './collectors';

/**
 * Directory where scan results are persisted as JSON files.
 *
 * On Vercel (and other serverless platforms), process.cwd() is read-only.
 * We use /tmp which is the only writable directory in serverless environments.
 * On local dev, /tmp also works fine.
 */
const SCANS_DIR = path.join('/tmp', 'health-scanner-scans');

// ─── Threshold Configuration ────────────────────────────────────────────────
// [warning, critical] for each category's primary % metric
const THRESHOLDS: Record<Category, [number, number]> = {
  cpu: [70, 90],
  memory: [75, 90],
  disk: [80, 95],
};

/**
 * Evaluate a metric's value against category thresholds.
 * Returns the appropriate status: 'normal', 'warning', or 'critical'.
 */
function evaluateStatus(category: Category, value: number): Status {
  const [warn, crit] = THRESHOLDS[category];
  if (value >= crit) return 'critical';
  if (value >= warn) return 'warning';
  return 'normal';
}

/**
 * Generate health flags for any metrics that exceed thresholds.
 * A flag is a human-readable warning about a detected issue.
 */
function generateFlags(metrics: MetricSnapshot[]): HealthFlag[] {
  const flags: HealthFlag[] = [];

  for (const metric of metrics) {
    if (metric.unit !== '%') continue; // Only evaluate percentage metrics
    const status = evaluateStatus(metric.category, metric.value);

    if (status === 'warning') {
      flags.push({
        category: metric.category,
        severity: 'warning',
        message: `${metric.label} is elevated at ${metric.value}%`,
      });
    } else if (status === 'critical') {
      flags.push({
        category: metric.category,
        severity: 'critical',
        message: `${metric.label} is critically high at ${metric.value}%`,
      });
    }
  }

  return flags;
}

/**
 * Determine overall scan status — the worst status across all metrics.
 * If any metric is critical, overall is critical. If any is warning, overall is warning.
 */
function determineOverallStatus(metrics: MetricSnapshot[]): Status {
  let overall: Status = 'normal';
  for (const metric of metrics) {
    if (metric.status === 'critical') return 'critical';
    if (metric.status === 'warning') overall = 'warning';
  }
  return overall;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run a full system scan:
 * 1. Get the platform-specific collector (Strategy Pattern)
 * 2. Collect raw metrics from OS shell commands
 * 3. Evaluate thresholds → assign status to each metric
 * 4. Generate human-readable health flags for issues
 * 5. Determine overall scan status (worst across all metrics)
 * 6. Persist the result as a JSON file in /tmp/health-scanner-scans/
 * 7. Return the complete ScanResult
 */
export async function runScan(): Promise<ScanResult> {
  // Ensure persistence directory exists
  await fs.mkdir(SCANS_DIR, { recursive: true });

  // Step 1-2: Collect metrics via platform collector
  const collector = getCollector();
  const rawMetrics = await collector.collect();

  // Step 3: Apply threshold evaluation to percentage metrics
  const metrics = rawMetrics.map((metric) => ({
    ...metric,
    status: metric.unit === '%'
      ? evaluateStatus(metric.category, metric.value)
      : metric.status,
  }));

  // Step 4-5: Generate flags and determine overall status
  const flags = generateFlags(metrics);
  const overallStatus = determineOverallStatus(metrics);

  // Step 6: Build and persist the result
  const result: ScanResult = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: process.platform,
    overallStatus,
    metrics,
    flags,
  };

  const filePath = path.join(SCANS_DIR, `${result.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');

  return result;
}

/**
 * Get all scan summaries, sorted newest-first.
 * Reads each JSON file but only returns the lightweight ScanSummary fields.
 */
export async function getScans(): Promise<ScanSummary[]> {
  try {
    await fs.mkdir(SCANS_DIR, { recursive: true });
    const files = await fs.readdir(SCANS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    const summaries: ScanSummary[] = [];

    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(
          path.join(SCANS_DIR, file),
          'utf-8'
        );
        const scan: ScanResult = JSON.parse(content);
        summaries.push({
          id: scan.id,
          timestamp: scan.timestamp,
          overallStatus: scan.overallStatus,
          hostname: scan.hostname,
        });
      } catch (_e) {
        // Skip corrupted files silently
        continue;
      }
    }

    // Sort newest-first by timestamp
    return summaries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (_e) {
    return [];
  }
}

/**
 * Get a single scan result by ID.
 * Includes path traversal sanitization — only allows UUID-format filenames.
 */
export async function getScanById(id: string): Promise<ScanResult | null> {
  // Sanitize: only allow valid UUID characters (hex + hyphens)
  const sanitized = id.replace(/[^a-f0-9-]/gi, '');
  if (sanitized !== id) return null;

  try {
    const filePath = path.join(SCANS_DIR, `${sanitized}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ScanResult;
  } catch (_e) {
    return null;
  }
}
