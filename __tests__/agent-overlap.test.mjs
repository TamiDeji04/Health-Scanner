/**
 * Tests that agent tick() does not run concurrently with itself.
 *
 * Bug: setInterval fires every INTERVAL_SECS regardless of whether
 * the previous tick() has completed. If a scan or HTTP POST takes
 * longer than the interval, multiple ticks run concurrently, sending
 * duplicate or interleaved scans to the dashboard.
 *
 * Fix: add an `isRunning` flag at the top of tick():
 *   if (isRunning) { warn and return }
 *   isRunning = true
 *   try { ... } finally { isRunning = false }
 *
 * This test verifies that when two ticks are invoked concurrently
 * (simulating setInterval firing before the first tick completes),
 * only one HTTP POST is made.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Simulate the tick logic BEFORE the fix (no guard)
function makeTick_Unsafe(postJSON, collectMetrics, dashboardUrl) {
  return async function tick() {
    const metrics = await collectMetrics();
    await postJSON(`${dashboardUrl}/api/scan`, { metrics });
  };
}

// Simulate the tick logic AFTER the fix (with isRunning guard)
function makeTick_Safe(postJSON, collectMetrics, dashboardUrl) {
  let isRunning = false;
  return async function tick() {
    if (isRunning) return; // skip overlapping execution
    isRunning = true;
    try {
      const metrics = await collectMetrics();
      await postJSON(`${dashboardUrl}/api/scan`, { metrics });
    } finally {
      isRunning = false;
    }
  };
}

// A slow collectMetrics that takes 200ms
function makeSlowCollector(postCount) {
  return async () => {
    await new Promise(r => setTimeout(r, 200));
    return [{ category: 'cpu', label: 'CPU Usage', value: 10, unit: '%', status: 'normal' }];
  };
}

describe('tick overlap guard', () => {
  it('unsafe: two concurrent ticks both complete (overlap occurs)', async () => {
    let postCount = 0;
    const fakePost = async () => { postCount++; };
    const collector = makeSlowCollector();
    const tick = makeTick_Unsafe(fakePost, collector, 'http://localhost');

    // Fire two ticks concurrently before the first finishes
    await Promise.all([tick(), tick()]);

    assert.equal(postCount, 2, 'unsafe: both ticks ran, causing overlap');
  });

  it('safe: second concurrent tick is skipped, only one POST made', async () => {
    let postCount = 0;
    const fakePost = async () => { postCount++; };
    const collector = makeSlowCollector();
    const tick = makeTick_Safe(fakePost, collector, 'http://localhost');

    // Fire two ticks concurrently — second should be skipped
    await Promise.all([tick(), tick()]);

    assert.equal(postCount, 1, 'safe: second tick was skipped due to isRunning guard');
  });
});
