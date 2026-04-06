/**
 * Tests for scan-service getScanById UUID handling.
 *
 * Bug: getScanById accepts an uppercase UUID through the regex sanitization
 * (because the /i flag makes [a-f] also match A-F), but then reads the file
 * using the original mixed-case string. Since uuidv4() always produces
 * lowercase UUIDs, the stored file is e.g. "550e8400-...json" — the lookup
 * using "550E8400-..." returns ENOENT (file not found) even though the scan
 * exists on disk.
 *
 * Fix: normalize id to lowercase before sanitization and file lookup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock 'fs' BEFORE importing scan-service so the module uses our mock.
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    readdir:  vi.fn(),
    mkdir:    vi.fn(),
    writeFile: vi.fn(),
  },
}));

// Also mock uuid to return a known value
vi.mock('uuid', () => ({ v4: () => '00000000-0000-0000-0000-000000000001' }));

// Mock os.hostname
vi.mock('os', () => ({ default: { hostname: () => 'test-host' }, hostname: () => 'test-host' }));

const LOWER_UUID = '550e8400-e29b-41d4-a716-446655440000';
const UPPER_UUID = '550E8400-E29B-41D4-A716-446655440000';

const mockScan = {
  id: LOWER_UUID,
  machineId: 'test-machine',
  timestamp: '2024-01-01T00:00:00.000Z',
  hostname: 'test-host',
  platform: 'linux',
  overallStatus: 'normal',
  metrics: [],
  flags: [],
};

describe('getScanById', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('finds a scan using an all-lowercase UUID', async () => {
    const { promises: fsMock } = await import('fs');
    (fsMock.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (fsMock.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(mockScan));

    const { getScanById } = await import('../lib/system/scan-service');
    const result = await getScanById(LOWER_UUID);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(LOWER_UUID);
  });

  it('finds a scan using an uppercase UUID (file stored as lowercase)', async () => {
    const { promises: fsMock } = await import('fs');
    (fsMock.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    // The file on disk is stored under the lowercase name
    (fsMock.readFile as ReturnType<typeof vi.fn>).mockImplementation((filePath: string) => {
      if ((filePath as string).includes(LOWER_UUID)) {
        return Promise.resolve(JSON.stringify(mockScan));
      }
      return Promise.reject(new Error('ENOENT'));
    });

    const { getScanById } = await import('../lib/system/scan-service');
    const result = await getScanById(UPPER_UUID);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(LOWER_UUID);
  });

  it('rejects path traversal attempts', async () => {
    const { promises: fsMock } = await import('fs');
    (fsMock.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { getScanById } = await import('../lib/system/scan-service');
    const result = await getScanById('../etc/passwd');

    expect(result).toBeNull();
  });

  it('returns null for UUIDs with invalid characters', async () => {
    const { promises: fsMock } = await import('fs');
    (fsMock.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { getScanById } = await import('../lib/system/scan-service');
    const result = await getScanById('not-a-valid-uuid!@#$');

    expect(result).toBeNull();
  });
});
