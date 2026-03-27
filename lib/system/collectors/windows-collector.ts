import { exec } from 'child_process';
import { promisify } from 'util';
import { MetricSnapshot } from '../types';
import { SystemCollector } from './collector-types';

const execAsync = promisify(exec);

/**
 * Windows-specific system metric collector.
 *
 * Uses PowerShell's Get-CimInstance to query WMI classes:
 * - CPU: Win32_Processor — LoadPercentage
 * - Memory: Win32_OperatingSystem — TotalVisibleMemorySize, FreePhysicalMemory
 * - Disk: Win32_LogicalDisk — Size, FreeSpace (filters to DriveType=3, fixed drives)
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
   * PowerShell returns LoadPercentage as a number.
   */
  private async collectCPU(): Promise<MetricSnapshot[]> {
    try {
      const { stdout } = await execAsync(
        'powershell -Command "Get-CimInstance Win32_Processor | Select-Object -ExpandProperty LoadPercentage"'
      );
      const load = parseFloat(stdout.trim()) || 0;

      return [
        {
          category: 'cpu',
          label: 'CPU Usage',
          value: load,
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
   * TotalVisibleMemorySize and FreePhysicalMemory are in KB.
   */
  private async collectMemory(): Promise<MetricSnapshot[]> {
    try {
      const { stdout } = await execAsync(
        'powershell -Command "Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize, FreePhysicalMemory | ConvertTo-Json"'
      );
      const data = JSON.parse(stdout.trim());
      const totalKB = data.TotalVisibleMemorySize || 1;
      const freeKB = data.FreePhysicalMemory || 0;
      const usedKB = totalKB - freeKB;

      const usedGB = Math.round((usedKB / 1048576) * 100) / 100;
      const totalGB = Math.round((totalKB / 1048576) * 100) / 100;
      const usedPercent = Math.round((usedKB / totalKB) * 10000) / 100;

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
   * Uses C: drive specifically for primary disk metrics.
   */
  private async collectDisk(): Promise<MetricSnapshot[]> {
    try {
      const { stdout } = await execAsync(
        'powershell -Command "Get-CimInstance Win32_LogicalDisk -Filter \'DriveType=3\' | Where-Object {$_.DeviceID -eq \'C:\'} | Select-Object Size, FreeSpace | ConvertTo-Json"'
      );
      const data = JSON.parse(stdout.trim());
      const totalBytes = data.Size || 1;
      const freeBytes = data.FreeSpace || 0;
      const usedBytes = totalBytes - freeBytes;

      const usedGB = Math.round((usedBytes / 1073741824) * 100) / 100;
      const totalGB = Math.round((totalBytes / 1073741824) * 100) / 100;
      const usedPercent = Math.round((usedBytes / totalBytes) * 10000) / 100;

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
