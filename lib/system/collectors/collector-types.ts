import { MetricSnapshot } from '../types';

/**
 * SystemCollector interface — the contract for platform-specific metric collection.
 *
 * This is the Strategy Pattern: each OS implements this interface with its own
 * shell commands and parsing logic, but the scan service doesn't care which
 * platform it's running on. It just calls collect() and gets back normalized
 * MetricSnapshot[] data.
 *
 * The factory function in index.ts selects the right collector at runtime
 * based on process.platform.
 */
export interface SystemCollector {
  /** Identifier for which platform this collector handles */
  platform: string;

  /**
   * Collect system metrics using OS-specific shell commands.
   * Returns normalized MetricSnapshot[] regardless of platform.
   * Must handle errors gracefully — return zeroed metrics on failure.
   */
  collect(): Promise<MetricSnapshot[]>;
}
