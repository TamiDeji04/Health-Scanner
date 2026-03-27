import { exec } from 'child_process';
import { promisify } from 'util';
import { MetricSnapshot } from '../types';
import { SystemCollector } from './collector-types';

const execAsync = promisify(exec);

/**
 * macOS-specific system metric collector.
 *
 * Uses native macOS commands to gather system health data:
 * - CPU: `top -l 1 -n 0` — one-shot top output, parses "CPU usage" line
 * - Memory: `vm_stat` for page stats + `sysctl hw.memsize` for total RAM
 * - Disk: `df -H /` for root filesystem usage
 *
 * Each method is wrapped in try/catch and returns zeroed metrics on failure,
 * so the app works safely even if a command is unavailable or permissions change.
 */
export class MacOSCollector implements SystemCollector {
  platform = 'darwin';

  async collect(): Promise<MetricSnapshot[]> {
    const [cpu, memory, disk] = await Promise.all([
      this.collectCPU(),
      this.collectMemory(),
      this.collectDisk(),
    ]);
    return [...cpu, ...memory, ...disk];
  }

  /**
   * Parse CPU usage from `top -l 1 -n 0`.
   * Looks for line like: "CPU usage: 12.34% user, 5.67% sys, 81.99% idle"
   * CPU usage = user% + sys%
   */
  private async collectCPU(): Promise<MetricSnapshot[]> {
    try {
      const { stdout } = await execAsync('top -l 1 -n 0');
      const cpuLine = stdout
        .split('\n')
        .find((line) => line.includes('CPU usage'));

      if (!cpuLine) return this.zeroCPU();

      const userMatch = cpuLine.match(/([\d.]+)%\s*user/);
      const sysMatch = cpuLine.match(/([\d.]+)%\s*sys/);

      const user = userMatch ? parseFloat(userMatch[1]) : 0;
      const sys = sysMatch ? parseFloat(sysMatch[1]) : 0;
      const total = Math.round((user + sys) * 100) / 100;

      return [
        {
          category: 'cpu',
          label: 'CPU Usage',
          value: total,
          unit: '%',
          status: 'normal', // Status is set by scan-service thresholds
        },
      ];
    } catch (_e) {
      return this.zeroCPU();
    }
  }

  /**
   * Parse memory usage from `vm_stat` + `sysctl hw.memsize`.
   *
   * vm_stat gives page counts (each page = 4096 bytes on macOS).
   * Used memory ≈ (active + wired) pages × page size.
   * Total memory comes from sysctl hw.memsize.
   */
  private async collectMemory(): Promise<MetricSnapshot[]> {
    try {
      const [vmResult, memResult] = await Promise.all([
        execAsync('vm_stat'),
        execAsync('sysctl hw.memsize'),
      ]);

      const pageSize = 4096;
      const activeMatch = vmResult.stdout.match(
        /Pages active:\s+([\d]+)/
      );
      const wiredMatch = vmResult.stdout.match(
        /Pages wired down:\s+([\d]+)/
      );
      const totalMatch = memResult.stdout.match(/hw\.memsize:\s+([\d]+)/);

      const activePages = activeMatch ? parseInt(activeMatch[1]) : 0;
      const wiredPages = wiredMatch ? parseInt(wiredMatch[1]) : 0;
      const totalBytes = totalMatch ? parseInt(totalMatch[1]) : 1;

      const usedBytes = (activePages + wiredPages) * pageSize;
      const usedGB = Math.round((usedBytes / 1073741824) * 100) / 100;
      const totalGB = Math.round((totalBytes / 1073741824) * 100) / 100;
      const usedPercent =
        Math.round((usedBytes / totalBytes) * 10000) / 100;

      return [
        {
          category: 'memory',
          label: 'Memory Usage',
          value: usedPercent,
          unit: '%',
          status: 'normal',
        },
        {
          category: 'memory',
          label: 'Used Memory',
          value: usedGB,
          unit: 'GB',
          status: 'normal',
        },
        {
          category: 'memory',
          label: 'Total Memory',
          value: totalGB,
          unit: 'GB',
          status: 'normal',
        },
      ];
    } catch (_e) {
      return this.zeroMemory();
    }
  }

  /**
   * Parse disk usage from `df -H /`.
   * Parses the second line (data row) for size, used, available, and capacity%.
   */
  private async collectDisk(): Promise<MetricSnapshot[]> {
    try {
      const { stdout } = await execAsync('df -H /');
      const lines = stdout.trim().split('\n');
      if (lines.length < 2) return this.zeroDisk();

      const parts = lines[1].split(/\s+/);
      // df -H output: Filesystem Size Used Avail Capacity ...
      const capacityStr = parts.find((p) => p.includes('%'));
      const capacity = capacityStr
        ? parseFloat(capacityStr.replace('%', ''))
        : 0;

      const sizeStr = parts[1] || '0G';
      const usedStr = parts[2] || '0G';

      return [
        {
          category: 'disk',
          label: 'Disk Usage',
          value: capacity,
          unit: '%',
          status: 'normal',
        },
        {
          category: 'disk',
          label: 'Disk Used',
          value: parseFloat(usedStr) || 0,
          unit: usedStr.replace(/[\d.]/g, '') || 'GB',
          status: 'normal',
        },
        {
          category: 'disk',
          label: 'Disk Total',
          value: parseFloat(sizeStr) || 0,
          unit: sizeStr.replace(/[\d.]/g, '') || 'GB',
          status: 'normal',
        },
      ];
    } catch (_e) {
      return this.zeroDisk();
    }
  }

  // ─── Fallback Zeroed Metrics ──────────────────────────────────────────────

  private zeroCPU(): MetricSnapshot[] {
    return [{ category: 'cpu', label: 'CPU Usage', value: 0, unit: '%', status: 'normal' }];
  }

  private zeroMemory(): MetricSnapshot[] {
    return [
      { category: 'memory', label: 'Memory Usage', value: 0, unit: '%', status: 'normal' },
      { category: 'memory', label: 'Used Memory', value: 0, unit: 'GB', status: 'normal' },
      { category: 'memory', label: 'Total Memory', value: 0, unit: 'GB', status: 'normal' },
    ];
  }

  private zeroDisk(): MetricSnapshot[] {
    return [
      { category: 'disk', label: 'Disk Usage', value: 0, unit: '%', status: 'normal' },
      { category: 'disk', label: 'Disk Used', value: 0, unit: 'GB', status: 'normal' },
      { category: 'disk', label: 'Disk Total', value: 0, unit: 'GB', status: 'normal' },
    ];
  }
}
