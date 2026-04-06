#!/usr/bin/env node
/**
 * System Health Scanner — Local Agent
 *
 * Runs on your machine, collects real CPU/memory/disk metrics,
 * and pushes them to your deployed dashboard on a schedule.
 *
 * Usage:
 *   node agent.mjs --url https://health-scanner-cyan.vercel.app
 *   node agent.mjs --url https://health-scanner-cyan.vercel.app --interval 30
 *
 * Options:
 *   --url        Your deployed dashboard URL (required)
 *   --interval   Seconds between scans (default: 30)
 *   --once       Run once and exit (no loop)
 *   --id         Override machine ID (default: hostname)
 */

import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import https from 'https';
import http from 'http';

const execAsync = promisify(exec);

// ─── CLI Args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : null;
};
const hasFlag = (name) => args.includes(`--${name}`);

const DASHBOARD_URL = getArg('url');
const INTERVAL_SECS = parseInt(getArg('interval') || '30', 10);
const RUN_ONCE = hasFlag('once');
const MACHINE_ID = getArg('id') || os.hostname();

if (!DASHBOARD_URL) {
  console.error('Error: --url is required.');
  console.error('Example: node agent.mjs --url https://health-scanner-cyan.vercel.app');
  process.exit(1);
}

// ─── Platform Detection ──────────────────────────────────────────────────────

const PLATFORM = process.platform; // 'darwin' | 'win32' | 'linux'

// ─── Collectors ──────────────────────────────────────────────────────────────

async function collectMacOS() {
  const metrics = [];

  // CPU
  try {
    const { stdout } = await execAsync('top -l 1 -n 0');
    const cpuLine = stdout.split('\n').find(l => l.includes('CPU usage'));
    if (cpuLine) {
      const user = parseFloat((cpuLine.match(/([\d.]+)%\s*user/) || [])[1] || '0');
      const sys  = parseFloat((cpuLine.match(/([\d.]+)%\s*sys/)  || [])[1] || '0');
      metrics.push({ category: 'cpu', label: 'CPU Usage', value: Math.round((user + sys) * 100) / 100, unit: '%', status: 'normal' });
    }
  } catch (_e) {
    metrics.push({ category: 'cpu', label: 'CPU Usage', value: 0, unit: '%', status: 'normal' });
  }

  // Memory
  try {
    const [{ stdout: vmOut }, { stdout: memOut }] = await Promise.all([
      execAsync('vm_stat'),
      execAsync('sysctl hw.memsize'),
    ]);
    const pageSize = 4096;
    const active = parseInt((vmOut.match(/Pages active:\s+(\d+)/)     || [])[1] || '0');
    const wired  = parseInt((vmOut.match(/Pages wired down:\s+(\d+)/) || [])[1] || '0');
    const total  = parseInt((memOut.match(/hw\.memsize:\s+(\d+)/)     || [])[1] || '1');
    const usedBytes = (active + wired) * pageSize;
    const usedGB  = Math.round(usedBytes / 1073741824 * 100) / 100;
    const totalGB = Math.round(total    / 1073741824 * 100) / 100;
    const pct     = Math.round(usedBytes / total * 10000) / 100;
    metrics.push({ category: 'memory', label: 'Memory Usage', value: pct,     unit: '%',  status: 'normal' });
    metrics.push({ category: 'memory', label: 'Used Memory',  value: usedGB,  unit: 'GB', status: 'normal' });
    metrics.push({ category: 'memory', label: 'Total Memory', value: totalGB, unit: 'GB', status: 'normal' });
  } catch (_e) {
    metrics.push({ category: 'memory', label: 'Memory Usage', value: 0, unit: '%',  status: 'normal' });
    metrics.push({ category: 'memory', label: 'Used Memory',  value: 0, unit: 'GB', status: 'normal' });
    metrics.push({ category: 'memory', label: 'Total Memory', value: 0, unit: 'GB', status: 'normal' });
  }

  // Disk — use df -k (kilobytes) to avoid unit-parsing bugs with large disks
  try {
    const { stdout } = await execAsync('df -k /');
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) throw new Error('Unexpected df output: missing data row');
    const parts   = lines[1].split(/\s+/);
    const totalKB = parseInt(parts[1] || '0', 10);
    const usedKB  = parseInt(parts[2] || '0', 10);
    const usedGB      = Math.round((usedKB  / 1048576) * 100) / 100;
    const totalGB     = Math.round((totalKB / 1048576) * 100) / 100;
    const usedPercent = totalKB > 0 ? Math.round((usedKB / totalKB) * 10000) / 100 : 0;
    metrics.push({ category: 'disk', label: 'Disk Usage', value: usedPercent, unit: '%',  status: 'normal' });
    metrics.push({ category: 'disk', label: 'Disk Used',  value: usedGB,      unit: 'GB', status: 'normal' });
    metrics.push({ category: 'disk', label: 'Disk Total', value: totalGB,     unit: 'GB', status: 'normal' });
  } catch (_e) {
    metrics.push({ category: 'disk', label: 'Disk Usage', value: 0, unit: '%',  status: 'normal' });
    metrics.push({ category: 'disk', label: 'Disk Used',  value: 0, unit: 'GB', status: 'normal' });
    metrics.push({ category: 'disk', label: 'Disk Total', value: 0, unit: 'GB', status: 'normal' });
  }

  return metrics;
}

async function collectLinux() {
  const metrics = [];

  // CPU (double-read /proc/stat)
  try {
    const read = async () => {
      const { stdout } = await execAsync("grep '^cpu ' /proc/stat");
      const parts = stdout.trim().split(/\s+/).slice(1).map(Number);
      return { idle: parts[3] || 0, total: parts.reduce((a, b) => a + b, 0) };
    };
    const s1 = await read();
    await new Promise(r => setTimeout(r, 200));
    const s2 = await read();
    const td = s2.total - s1.total;
    const id = s2.idle  - s1.idle;
    const usage = td > 0 ? Math.round((td - id) / td * 10000) / 100 : 0;
    metrics.push({ category: 'cpu', label: 'CPU Usage', value: usage, unit: '%', status: 'normal' });
  } catch (_e) {
    metrics.push({ category: 'cpu', label: 'CPU Usage', value: 0, unit: '%', status: 'normal' });
  }

  // Memory
  try {
    const { stdout } = await execAsync('cat /proc/meminfo');
    const totalKB = parseInt((stdout.match(/MemTotal:\s+(\d+)/)     || [])[1] || '1');
    const availKB = parseInt((stdout.match(/MemAvailable:\s+(\d+)/) || [])[1] || '0');
    const usedKB  = totalKB - availKB;
    const usedGB  = Math.round(usedKB  / 1048576 * 100) / 100;
    const totalGB = Math.round(totalKB / 1048576 * 100) / 100;
    const pct     = Math.round(usedKB / totalKB * 10000) / 100;
    metrics.push({ category: 'memory', label: 'Memory Usage', value: pct,     unit: '%',  status: 'normal' });
    metrics.push({ category: 'memory', label: 'Used Memory',  value: usedGB,  unit: 'GB', status: 'normal' });
    metrics.push({ category: 'memory', label: 'Total Memory', value: totalGB, unit: 'GB', status: 'normal' });
  } catch (_e) {
    metrics.push({ category: 'memory', label: 'Memory Usage', value: 0, unit: '%',  status: 'normal' });
    metrics.push({ category: 'memory', label: 'Used Memory',  value: 0, unit: 'GB', status: 'normal' });
    metrics.push({ category: 'memory', label: 'Total Memory', value: 0, unit: 'GB', status: 'normal' });
  }

  // Disk — use df -k (kilobytes) to avoid unit-parsing bugs with large disks
  try {
    const { stdout } = await execAsync('df -k /');
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) throw new Error('Unexpected df output: missing data row');
    const parts   = lines[1].split(/\s+/);
    const totalKB = parseInt(parts[1] || '0', 10);
    const usedKB  = parseInt(parts[2] || '0', 10);
    const usedGB      = Math.round((usedKB  / 1048576) * 100) / 100;
    const totalGB     = Math.round((totalKB / 1048576) * 100) / 100;
    const usedPercent = totalKB > 0 ? Math.round((usedKB / totalKB) * 10000) / 100 : 0;
    metrics.push({ category: 'disk', label: 'Disk Usage', value: usedPercent, unit: '%',  status: 'normal' });
    metrics.push({ category: 'disk', label: 'Disk Used',  value: usedGB,      unit: 'GB', status: 'normal' });
    metrics.push({ category: 'disk', label: 'Disk Total', value: totalGB,     unit: 'GB', status: 'normal' });
  } catch (_e) {
    metrics.push({ category: 'disk', label: 'Disk Usage', value: 0, unit: '%',  status: 'normal' });
    metrics.push({ category: 'disk', label: 'Disk Used',  value: 0, unit: 'GB', status: 'normal' });
    metrics.push({ category: 'disk', label: 'Disk Total', value: 0, unit: 'GB', status: 'normal' });
  }

  return metrics;
}

async function collectWindows() {
  const metrics = [];

  // CPU
  try {
    const { stdout } = await execAsync(
      'powershell -Command "Get-CimInstance Win32_Processor | Select-Object -ExpandProperty LoadPercentage"'
    );
    metrics.push({ category: 'cpu', label: 'CPU Usage', value: parseFloat(stdout.trim()) || 0, unit: '%', status: 'normal' });
  } catch (_e) {
    metrics.push({ category: 'cpu', label: 'CPU Usage', value: 0, unit: '%', status: 'normal' });
  }

  // Memory
  try {
    const { stdout } = await execAsync(
      'powershell -Command "Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize,FreePhysicalMemory | ConvertTo-Json"'
    );
    const d = JSON.parse(stdout.trim());
    const totalKB = d.TotalVisibleMemorySize || 1;
    const freeKB  = d.FreePhysicalMemory     || 0;
    const usedKB  = totalKB - freeKB;
    metrics.push({ category: 'memory', label: 'Memory Usage', value: Math.round(usedKB/totalKB*10000)/100, unit: '%',  status: 'normal' });
    metrics.push({ category: 'memory', label: 'Used Memory',  value: Math.round(usedKB /1048576*100)/100,  unit: 'GB', status: 'normal' });
    metrics.push({ category: 'memory', label: 'Total Memory', value: Math.round(totalKB/1048576*100)/100,  unit: 'GB', status: 'normal' });
  } catch (_e) {
    metrics.push({ category: 'memory', label: 'Memory Usage', value: 0, unit: '%',  status: 'normal' });
    metrics.push({ category: 'memory', label: 'Used Memory',  value: 0, unit: 'GB', status: 'normal' });
    metrics.push({ category: 'memory', label: 'Total Memory', value: 0, unit: 'GB', status: 'normal' });
  }

  // Disk
  try {
    const { stdout } = await execAsync(
      "powershell -Command \"Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Where-Object {$_.DeviceID -eq 'C:'} | Select-Object Size,FreeSpace | ConvertTo-Json\""
    );
    const d = JSON.parse(stdout.trim());
    const total = d.Size       || 1;
    const free  = d.FreeSpace  || 0;
    const used  = total - free;
    metrics.push({ category: 'disk', label: 'Disk Usage', value: Math.round(used/total*10000)/100,   unit: '%',  status: 'normal' });
    metrics.push({ category: 'disk', label: 'Disk Used',  value: Math.round(used /1073741824*100)/100, unit: 'GB', status: 'normal' });
    metrics.push({ category: 'disk', label: 'Disk Total', value: Math.round(total/1073741824*100)/100, unit: 'GB', status: 'normal' });
  } catch (_e) {
    metrics.push({ category: 'disk', label: 'Disk Usage', value: 0, unit: '%',  status: 'normal' });
    metrics.push({ category: 'disk', label: 'Disk Used',  value: 0, unit: 'GB', status: 'normal' });
    metrics.push({ category: 'disk', label: 'Disk Total', value: 0, unit: 'GB', status: 'normal' });
  }

  return metrics;
}

async function collectMetrics() {
  if (PLATFORM === 'darwin') return collectMacOS();
  if (PLATFORM === 'win32')  return collectWindows();
  return collectLinux();
}

// ─── HTTP Push ───────────────────────────────────────────────────────────────

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'HealthScanner-Agent/1.0',
      },
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.setTimeout(30000, () => {
      req.destroy(new Error('Request timeout after 30s'));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ─── Main Loop ───────────────────────────────────────────────────────────────

async function tick() {
  const ts = new Date().toISOString();
  try {
    console.log(`[${ts}] Collecting metrics from ${os.hostname()} (${PLATFORM})...`);
    const metrics = await collectMetrics();
    const payload = {
      machineId: MACHINE_ID,
      hostname:  os.hostname(),
      platform:  PLATFORM,
      metrics,
    };
    const { status, body } = await postJSON(`${DASHBOARD_URL}/api/scan`, payload);
    if (status === 200) {
      const scan = JSON.parse(body);
      console.log(`[${ts}] ✓ Scan pushed — status: ${scan.overallStatus} (id: ${scan.id.slice(0,8)})`);
    } else {
      console.error(`[${ts}] ✗ Server returned ${status}: ${body}`);
    }
  } catch (err) {
    console.error(`[${ts}] ✗ Failed to push scan:`, err.message);
  }
}

console.log(`Health Scanner Agent starting`);
console.log(`  Machine ID : ${MACHINE_ID}`);
console.log(`  Dashboard  : ${DASHBOARD_URL}`);
console.log(`  Interval   : ${RUN_ONCE ? 'once' : `${INTERVAL_SECS}s`}`);
console.log('');

(async () => {
  await tick();
  if (!RUN_ONCE) {
    setInterval(tick, INTERVAL_SECS * 1000);
  }
})();
