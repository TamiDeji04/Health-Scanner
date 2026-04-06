import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import {
  ScanResult, ScanSummary, MetricSnapshot, HealthFlag,
  Status, Category, MachineInfo
} from './types';
import { getCollector } from './collectors';

/**
 * All persistence goes under /tmp — the only writable directory in serverless.
 */
const BASE_DIR = '/tmp/health-scanner';
const SCANS_DIR = path.join(BASE_DIR, 'scans');
const MACHINES_DIR = path.join(BASE_DIR, 'machines');

const THRESHOLDS: Record<Category, [number, number]> = {
  cpu:    [70, 90],
  memory: [75, 90],
  disk:   [80, 95],
};

function evaluateStatus(category: Category, value: number): Status {
  const [warn, crit] = THRESHOLDS[category];
  if (value >= crit) return 'critical';
  if (value >= warn) return 'warning';
  return 'normal';
}

function generateFlags(metrics: MetricSnapshot[]): HealthFlag[] {
  const flags: HealthFlag[] = [];
  for (const metric of metrics) {
    if (metric.unit !== '%') continue;
    const status = evaluateStatus(metric.category, metric.value);
    if (status === 'warning') {
      flags.push({ category: metric.category, severity: 'warning', message: `${metric.label} is elevated at ${metric.value}%` });
    } else if (status === 'critical') {
      flags.push({ category: metric.category, severity: 'critical', message: `${metric.label} is critically high at ${metric.value}%` });
    }
  }
  return flags;
}

function determineOverallStatus(metrics: MetricSnapshot[]): Status {
  let overall: Status = 'normal';
  for (const metric of metrics) {
    if (metric.status === 'critical') return 'critical';
    if (metric.status === 'warning') overall = 'warning';
  }
  return overall;
}

async function ensureDirs() {
  await fs.mkdir(SCANS_DIR, { recursive: true });
  await fs.mkdir(MACHINES_DIR, { recursive: true });
}

// ─── Machine Registry ────────────────────────────────────────────────────────

/**
 * Upsert a machine entry so the dashboard knows about it.
 */
export async function upsertMachine(info: MachineInfo): Promise<void> {
  await ensureDirs();
  const filePath = path.join(MACHINES_DIR, `${info.machineId}.json`);
  await fs.writeFile(filePath, JSON.stringify(info, null, 2), 'utf-8');
}

/**
 * List all known machines, sorted by lastSeen descending.
 */
export async function getMachines(): Promise<MachineInfo[]> {
  await ensureDirs();
  try {
    const files = await fs.readdir(MACHINES_DIR);
    const machines: MachineInfo[] = [];
    for (const file of files.filter(f => f.endsWith('.json'))) {
      try {
        const content = await fs.readFile(path.join(MACHINES_DIR, file), 'utf-8');
        machines.push(JSON.parse(content));
      } catch (_e) { continue; }
    }
    return machines.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
  } catch (_e) {
    return [];
  }
}

// ─── Scan Service ────────────────────────────────────────────────────────────

/**
 * Run a scan on the server itself (fallback mode — scans Vercel's container).
 */
export async function runScan(): Promise<ScanResult> {
  await ensureDirs();
  const collector = getCollector();
  const rawMetrics = await collector.collect();
  const metrics = rawMetrics.map(m => ({
    ...m,
    status: m.unit === '%' ? evaluateStatus(m.category, m.value) : m.status,
  }));
  const flags = generateFlags(metrics);
  const overallStatus = determineOverallStatus(metrics);
  const hostname = os.hostname();
  const result: ScanResult = {
    id: uuidv4(),
    machineId: hostname,
    timestamp: new Date().toISOString(),
    hostname,
    platform: process.platform,
    overallStatus,
    metrics,
    flags,
  };
  await persistScan(result);
  await upsertMachine({ machineId: hostname, hostname, platform: process.platform, lastSeen: result.timestamp });
  return result;
}

/**
 * Accept a pre-collected scan pushed by a remote agent.
 * The agent runs on the user's actual machine and POSTs the result here.
 */
export async function ingestAgentScan(payload: {
  machineId: string;
  hostname: string;
  platform: string;
  metrics: MetricSnapshot[];
}): Promise<ScanResult> {
  await ensureDirs();
  const metrics = payload.metrics.map(m => ({
    ...m,
    status: m.unit === '%' ? evaluateStatus(m.category, m.value) : m.status,
  }));
  const flags = generateFlags(metrics);
  const overallStatus = determineOverallStatus(metrics);
  const result: ScanResult = {
    id: uuidv4(),
    machineId: payload.machineId,
    timestamp: new Date().toISOString(),
    hostname: payload.hostname,
    platform: payload.platform,
    overallStatus,
    metrics,
    flags,
  };
  await persistScan(result);
  await upsertMachine({
    machineId: payload.machineId,
    hostname: payload.hostname,
    platform: payload.platform,
    lastSeen: result.timestamp,
  });
  return result;
}

async function persistScan(result: ScanResult): Promise<void> {
  const filePath = path.join(SCANS_DIR, `${result.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
}

/**
 * Get all scan summaries, optionally filtered by machineId, newest-first.
 */
export async function getScans(machineId?: string): Promise<ScanSummary[]> {
  await ensureDirs();
  try {
    const files = await fs.readdir(SCANS_DIR);
    const summaries: ScanSummary[] = [];
    for (const file of files.filter(f => f.endsWith('.json'))) {
      try {
        const content = await fs.readFile(path.join(SCANS_DIR, file), 'utf-8');
        const scan: ScanResult = JSON.parse(content);
        if (machineId && scan.machineId !== machineId) continue;
        summaries.push({
          id: scan.id,
          machineId: scan.machineId,
          timestamp: scan.timestamp,
          overallStatus: scan.overallStatus,
          hostname: scan.hostname,
        });
      } catch (_e) { continue; }
    }
    return summaries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (_e) {
    return [];
  }
}

export async function getScanById(id: string): Promise<ScanResult | null> {
  const lower = id.toLowerCase();
  const sanitized = lower.replace(/[^a-f0-9-]/g, '');
  if (sanitized !== lower) return null;
  try {
    const content = await fs.readFile(path.join(SCANS_DIR, `${sanitized}.json`), 'utf-8');
    return JSON.parse(content) as ScanResult;
  } catch (_e) {
    return null;
  }
}
