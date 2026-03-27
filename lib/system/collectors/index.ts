import { SystemCollector } from './collector-types';
import { MacOSCollector } from './macos-collector';
import { WindowsCollector } from './windows-collector';
import { LinuxCollector } from './linux-collector';

/**
 * Factory function — returns the correct SystemCollector for the current OS.
 *
 * This is the entry point of the Strategy Pattern:
 * - 'darwin' → MacOSCollector (uses top, vm_stat, sysctl, df)
 * - 'win32'  → WindowsCollector (uses PowerShell Get-CimInstance)
 * - default  → LinuxCollector (uses /proc/stat, /proc/meminfo, df)
 *
 * The scan service calls getCollector() without knowing which OS it's on.
 * The factory handles the decision, and the returned collector handles
 * the platform-specific implementation.
 */
export function getCollector(): SystemCollector {
  switch (process.platform) {
    case 'darwin':
      return new MacOSCollector();
    case 'win32':
      return new WindowsCollector();
    default:
      return new LinuxCollector();
  }
}
