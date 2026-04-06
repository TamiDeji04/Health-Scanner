/**
 * Tests for agent.mjs df output parsing safety.
 *
 * Bug: agent.mjs (macOS & Linux disk sections) calls
 *   stdout.trim().split('\n')[1].split(/\s+/)
 * with no length check — throws TypeError if df returns only a header line.
 *
 * Fix: check lines.length < 2 and throw before accessing [1].
 * The surrounding try/catch already handles the throw → pushes zero metrics.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Inline the helper logic as it exists BEFORE the fix (unsafe version)
function parseDfUnsafe(stdout) {
  const parts = stdout.trim().split('\n')[1].split(/\s+/);
  return {
    totalKB: parseInt(parts[1] || '0', 10),
    usedKB:  parseInt(parts[2] || '0', 10),
  };
}

// Inline the helper logic AFTER the fix (safe version)
function parseDfSafe(stdout) {
  const lines = stdout.trim().split('\n');
  if (lines.length < 2) throw new Error('Unexpected df output: missing data row');
  const parts = lines[1].split(/\s+/);
  return {
    totalKB: parseInt(parts[1] || '0', 10),
    usedKB:  parseInt(parts[2] || '0', 10),
  };
}

describe('parseDf - unsafe version', () => {
  it('parses normal two-line df output correctly', () => {
    const stdout = 'Filesystem     1K-blocks      Used Available Use% Mounted on\n' +
                   '/dev/sda1      976762584 500000000 476762584  52% /';
    const result = parseDfUnsafe(stdout);
    assert.equal(result.totalKB, 976762584);
    assert.equal(result.usedKB,  500000000);
  });

  it('throws TypeError when df returns only a header line', () => {
    const stdout = 'Filesystem 1K-blocks Used Available Use% Mounted on';
    assert.throws(
      () => parseDfUnsafe(stdout),
      /Cannot read properties of undefined|TypeError/
    );
  });
});

describe('parseDf - safe version (after fix)', () => {
  it('parses normal two-line df output correctly', () => {
    const stdout = 'Filesystem     1K-blocks      Used Available Use% Mounted on\n' +
                   '/dev/sda1      976762584 500000000 476762584  52% /';
    const result = parseDfSafe(stdout);
    assert.equal(result.totalKB, 976762584);
    assert.equal(result.usedKB,  500000000);
  });

  it('throws a descriptive Error (not a TypeError) when only one line', () => {
    const stdout = 'Filesystem 1K-blocks Used Available Use% Mounted on';
    assert.throws(
      () => parseDfSafe(stdout),
      { message: 'Unexpected df output: missing data row' }
    );
  });

  it('handles empty stdout gracefully by throwing', () => {
    assert.throws(() => parseDfSafe(''));
  });
});
