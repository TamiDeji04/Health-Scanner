import { exec } from 'child_process';
import { promisify } from 'util';
import { MetricSnapshot } from '../types';
import { SystemCollector } from './collector-types';

const execAsync = promisify(exec);

/**
 * Windows-specific system metric collector.
 *
 * Uses PowerShell's Get-CimInstance to query WMI classes:
 * - CPU: Win32_Processor — LoadPercentage (raw integer %)
 * - Memory: Win32_OperatingSystem — TotalVisibleMemorySize, FreePhysicalMemory (raw KB integers)
 * - Disk: Win32_LogicalDisk — Size, FreeSpace (raw byte integers, filters to DriveType=3)
 *
 * All values come from PowerShell JSON — raw integers with no unit suffix strings,
 * so there is no unit-truncation risk. Explicit parseInt/parseFloat with guards
 * are used for consistency across all collectors.
 *
 * PowerShell is invoked via `powershell -Command "..."` for each query.
 * All commands wrapped in try/catch — returns zeroed metrics on failure.
 */
export class WindowsCollector implements SystemCollector {
  platform = 'win32';

  async collect(): Promise<MetricSnapshot[]> {
    const [cpu, memory, disk] = await Promise.all([
      this.collectCPU(),
      this.collectMemory(),
      this.collectDisk(),
    ]);
    return [...cpu, ...memory, ...disk];
  }

  /**
   * Query CPU load via Win32_Processor.
   * PowerShell returns LoadPercentage as a plain integer — no unit suffix.
   */
  private async collectCPU(): Promise<MetricSnapshot[]> {
    try {
      const { stdout } = await execAsync(
        'powershell -Command "Get-CimInstance Win32_Processor | Select-Object -ExpandProperty LoadPercentage"'
      );
      const load = parseFloat(stdout.trim());

      return [
        {
          category: 'cpu',
          label: 'CPU Usage',
          value: isNaN(load) ? 0 : load,
          unit: '%',
          status: 'normal',
        },
      ];
    } catch (_e) {
      return [{ category: 'cpu', label: 'CPU Usage', value: 0, unit: '%', status: 'normal' }];
    }
  }

  /**
   * Query memory via Win32_OperatingSystem.
   * TotalVisibleMemorySize and FreePhysicalMemory are raw KB integers in JSON.
   */
  private async collectMemory(): Promise<MetricSnapshot[]> {
    try {
      const { stdout } = await execAsync(
        'powershell -Command "Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize, FreePhysicalMemory | ConvertTo-Json"'
      );
      const data = JSON.parse(stdout.trim());
      const totalKB = parseInt(data.TotalVisibleMemorySize, 10) || 1;
      const freeKB = parseInt(data.FreePhysicalMemory, 10) || 0;
      const usedKB = Math.max(0, totalKB - freeKB);

      const usedGB = Math.round((usedKB / 1048576) * 100) / 100;
      const totalGB = Math.round((totalKB / 1048576) * 100) / 100;
      const usedPercent = totalKB > 0
        ? Math.min(100, Math.round((usedKB / totalKB) * 10000) / 100)
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
   * Query disk via Win32_LogicalDisk (DriveType=3 = fixed drives).
   * Size and FreeSpace are raw byte integers in JSON — no unit suffix risk.
   * Uses C: drive specifically for primary disk metrics.
   */
  private async collectDisk(): Promise<MetricSnapshot[]> {
    try {
      const { stdout } = await execAsync(
        'powershell -Command "Get-CimInstance Win32_LogicalDisk -Filter \'DriveType=3\' | Where-Object {$_.DeviceID -eq \'C:\'} | Select-Object Size, FreeSpace | ConvertTo-Json"'
      );
      const data = JSON.parse(stdout.trim());
      const totalBytes = parseInt(data.Size, 10) || 1;
      const freeBytes = parseInt(data.FreeSpace, 10) || 0;
      const usedBytes = totalBytes - freeBytes;

      const usedGB = Math.round((usedBytes / 1073741824) * 100) / 100;
      const totalGB = Math.round((totalBytes / 1073741824) * 100) / 100;
      const usedPercent = totalBytes > 0
        ? Math.round((usedBytes / totalBytes) * 10000) / 100
        : 0;

      return [
        { category: 'disk', label: 'Disk Usage', value: usedPercent, unit: '%', status: 'normal' },
        { category: 'disk', label: 'Disk Used', value: usedGB, unit: 'GB', status: 'normal' },
        { category: 'disk', label: 'Disk Total', value: totalGB, unit: 'GB', status: 'normal' },
      ];
    } catch (_e) {
      return [
        { category: 'disk', label: 'Disk Usage', value: 0, unit: '%', status: 'normal' },
        { category: 'disk', label: 'Disk Used', value: 0, unit: 'GB', status: 'normal' },
        { category: 'disk', label: 'Disk Total', value: 0, unit: 'GB', status: 'normal' },
      ];
    }
  }
}
