/**
 * Tests that all three platform collectors clamp memory to non-negative values.
 *
 * Bug: usedKB = totalKB - availKB can go negative when the kernel reports
 * MemAvailable > MemTotal (rare but possible race condition in /proc/meminfo
 * reads) or when PowerShell returns stale/inconsistent WMI data.
 *
 * Without Math.max(0, ...), negative values propagate to:
 *   - usedGB  → negative GB reported
 *   - usedPercent → negative % reported (and UI progress ring renders wrong)
 *
 * Fix: apply Math.max(0, totalKB - availKB) in each collector.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Linux Collector ─────────────────────────────────────────────────────────

vi.mock('child_process', () => ({ exec: vi.fn() }));
// promisify must return a real Promise-returning wrapper so await execAsync() works
vi.mock('util', () => ({
  promisify: (fn: any) => (...args: any[]) =>
    new Promise((resolve, reject) =>
      fn(...args, (err: any, result: any) => (err ? reject(err) : resolve(result)))
    ),
}));

describe('LinuxCollector memory clamping', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns non-negative usedKB when MemAvailable > MemTotal', async () => {
    const { exec } = await import('child_process');
    (exec as any).mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('meminfo')) {
        // MemAvailable > MemTotal — simulates race condition
        cb(null, { stdout: 'MemTotal:     1000000 kB\nMemAvailable: 1200000 kB\n' });
      } else {
        cb(null, { stdout: '' });
      }
    });

    const { LinuxCollector } = await import('../lib/system/collectors/linux-collector');
    const col = new LinuxCollector();
    const metrics = await (col as any).collectMemory();

    const usage = metrics.find((m: any) => m.label === 'Memory Usage');
    const usedGB = metrics.find((m: any) => m.label === 'Used Memory');

    expect(usage?.value).toBeGreaterThanOrEqual(0);
    expect(usedGB?.value).toBeGreaterThanOrEqual(0);
  });

  it('returns correct values for normal memory state', async () => {
    const { exec } = await import('child_process');
    (exec as any).mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('meminfo')) {
        cb(null, { stdout: 'MemTotal:     8000000 kB\nMemAvailable: 4000000 kB\n' });
      } else {
        cb(null, { stdout: '' });
      }
    });

    const { LinuxCollector } = await import('../lib/system/collectors/linux-collector');
    const col = new LinuxCollector();
    const metrics = await (col as any).collectMemory();

    const usage = metrics.find((m: any) => m.label === 'Memory Usage');
    expect(usage?.value).toBe(50); // 4000000/8000000 = 50%
  });
});

// ─── macOS Collector ─────────────────────────────────────────────────────────

describe('MacOSCollector memory clamping', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns non-negative percent when usedBytes > totalBytes', async () => {
    const { exec } = await import('child_process');
    (exec as any).mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('vm_stat')) {
        // Very high active+wired pages that exceed total memory
        cb(null, { stdout: 'Pages active:     300000.\nPages wired down: 300000.\n' });
      } else if (cmd.includes('sysctl')) {
        // 1 GB total — but pages * 4096 = 2.4 GB used
        cb(null, { stdout: 'hw.memsize: 1073741824\n' });
      } else {
        cb(null, { stdout: '' });
      }
    });

    const { MacOSCollector } = await import('../lib/system/collectors/macos-collector');
    const col = new MacOSCollector();
    const metrics = await (col as any).collectMemory();

    const usage = metrics.find((m: any) => m.label === 'Memory Usage');
    const usedGB = metrics.find((m: any) => m.label === 'Used Memory');

    // usedPercent should not exceed 100
    expect(usage?.value).toBeLessThanOrEqual(100);
    // usedGB should not be negative
    expect(usedGB?.value).toBeGreaterThanOrEqual(0);
  });
});

// ─── Windows Collector ───────────────────────────────────────────────────────

describe('WindowsCollector memory clamping', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns non-negative usedKB when freeKB > totalKB', async () => {
    const { exec } = await import('child_process');
    (exec as any).mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('Win32_OperatingSystem')) {
        // FreePhysicalMemory > TotalVisibleMemorySize — inconsistent WMI state
        cb(null, {
          stdout: JSON.stringify({
            TotalVisibleMemorySize: 1000000,
            FreePhysicalMemory: 1200000,
          }),
        });
      } else {
        cb(null, { stdout: '' });
      }
    });

    const { WindowsCollector } = await import('../lib/system/collectors/windows-collector');
    const col = new WindowsCollector();
    const metrics = await (col as any).collectMemory();

    const usage = metrics.find((m: any) => m.label === 'Memory Usage');
    const usedGB = metrics.find((m: any) => m.label === 'Used Memory');

    expect(usage?.value).toBeGreaterThanOrEqual(0);
    expect(usedGB?.value).toBeGreaterThanOrEqual(0);
  });
});
