import { exec } from 'child_process';
import { promisify } from 'util';
import { MetricSnapshot } from '../types';
import { SystemCollector } from './collector-types';

const execAsync = promisify(exec);

/**
 * Linux-specific system metric collector.
 *
 * Uses standard Linux commands:
 * - CPU: reads /proc/stat twice (100ms apart) to calculate actual CPU usage
 * - Memory: reads /proc/meminfo for MemTotal, MemAvailable (raw KB integers)
 * - Disk: `df -k /` — raw kilobytes, converted to GB manually (avoids unit-string
 *   truncation that occurs with `df -H` on large disks, e.g. 2.0T → 2.0)
 *
 * This collector also serves as the fallback for unknown platforms,
 * since many Linux commands work on other Unix-like systems.
 */
export class LinuxCollector implements SystemCollector {
  platform = 'linux';

  async collect(): Promise<MetricSnapshot[]> {
    const [cpu, memory, disk] = await Promise.all([
      this.collectCPU(),
      this.collectMemory(),
      this.collectDisk(),
    ]);
    return [...cpu, ...memory, ...disk];
  }

  /**
   * Calculate CPU usage by reading /proc/stat twice with a 100ms gap.
   * Compares total and idle jiffies to derive actual CPU utilization.
   * All values are raw integers — no unit strings involved.
   */
  private async collectCPU(): Promise<MetricSnapshot[]> {
    try {
      const { stdout } = await execAsync("grep 'cpu ' /proc/stat");
      const parts = stdout.trim().split(/\s+/).slice(1).map(Number);
      const idle1 = parts[3] || 0;
      const total1 = parts.reduce((a, b) => a + b, 0);

      // Wait 100ms for a second reading
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { stdout: stdout2 } = await execAsync("grep 'cpu ' /proc/stat");
      const parts2 = stdout2.trim().split(/\s+/).slice(1).map(Number);
      const idle2 = parts2[3] || 0;
      const total2 = parts2.reduce((a, b) => a + b, 0);

      const totalDiff = total2 - total1;
      const idleDiff = idle2 - idle1;
      const usage = totalDiff > 0
        ? Math.round(((totalDiff - idleDiff) / totalDiff) * 10000) / 100
        : 0;

      return [
        {
          category: 'cpu',
          label: 'CPU Usage',
          value: isNaN(usage) ? 0 : usage,
          unit: '%',
          status: 'normal',
        },
      ];
    } catch (_e) {
      return [{ category: 'cpu', label: 'CPU Usage', value: 0, unit: '%', status: 'normal' }];
    }
  }

  /**
   * Parse /proc/meminfo for MemTotal and MemAvailable.
   * Both values are raw kilobyte integers — no unit conversion ambiguity.
   * Used = Total - Available.
   */
  private async collectMemory(): Promise<MetricSnapshot[]> {
    try {
      const { stdout } = await execAsync('cat /proc/meminfo');
      const totalMatch = stdout.match(/MemTotal:\s+([\d]+)/);
      const availMatch = stdout.match(/MemAvailable:\s+([\d]+)/);

      const totalKB = totalMatch ? parseInt(totalMatch[1], 10) : 1;
      const availKB = availMatch ? parseInt(availMatch[1], 10) : 0;
      const usedKB = totalKB - availKB;

      const usedGB = Math.round((usedKB / 1048576) * 100) / 100;
      const totalGB = Math.round((totalKB / 1048576) * 100) / 100;
      const usedPercent = totalKB > 0
        ? Math.round((usedKB / totalKB) * 10000) / 100
        : 0;

      return [
        { category: 'memory', label: 'Memory Usage', value: usedPercent, unit: '%', status: 'normal' },
        { category: 'memory', label: 'Used Memory', value: usedGB, unit: 'GB', status: 'normal' },
        { category: 'memory', label: 'Total Memory', value: totalGB, unit: 'GB', status: 'normal' },
      ];
    } catch (_e) {
      return [
        { category: 'memory', label: 'Memory Usage', value: 0, unit: '%', status: 'normal' },
        { category: 'memory', label: 'Used Memory', value: 0, unit: 'GB', status: 'normal' },
        { category: 'memory', label: 'Total Memory', value: 0, unit: 'GB', status: 'normal' },
      ];
    }
  }

  /**
   * Parse disk usage from `df -k /`.
   *
   * Uses `-k` (kilobytes) instead of `-H` (human-readable) to get raw integer
   * values. `df -H` returns strings like "2.0T" or "500G" — parseFloat strips
   * the unit suffix, making large-disk percentages wildly inaccurate.
   * `-k` always outputs plain kilobyte integers regardless of disk size.
   */
  private async collectDisk(): Promise<MetricSnapshot[]> {
    try {
      const { stdout } = await execAsync('df -k /');
      const lines = stdout.trim().split('\n');
      if (lines.length < 2) return this.zeroDisk();

      // df -k output: Filesystem 1K-blocks Used Available Use% ...
      const parts = lines[1].split(/\s+/);
      const totalKB = parseInt(parts[1] || '0', 10);
      const usedKB = parseInt(parts[2] || '0', 10);

      const usedGB = Math.round((usedKB / 1048576) * 100) / 100;
      const totalGB = Math.round((totalKB / 1048576) * 100) / 100;
      const usedPercent = totalKB > 0
        ? Math.round((usedKB / totalKB) * 10000) / 100
        : 0;

      return [
        { category: 'disk', label: 'Disk Usage', value: usedPercent, unit: '%', status: 'normal' },
        { category: 'disk', label: 'Disk Used', value: usedGB, unit: 'GB', status: 'normal' },
        { category: 'disk', label: 'Disk Total', value: totalGB, unit: 'GB', status: 'normal' },
      ];
    } catch (_e) {
      return this.zeroDisk();
    }
  }

  private zeroDisk(): MetricSnapshot[] {
    return [
      { category: 'disk', label: 'Disk Usage', value: 0, unit: '%', status: 'normal' },
      { category: 'disk', label: 'Disk Used', value: 0, unit: 'GB', status: 'normal' },
      { category: 'disk', label: 'Disk Total', value: 0, unit: 'GB', status: 'normal' },
    ];
  }
}
