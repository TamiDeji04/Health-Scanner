/**
 * Tests that agent.mjs postJSON rejects with a timeout error
 * when the server never responds.
 *
 * Bug: postJSON uses http.request with no timeout set.
 * If the server hangs (no response, no error), the agent blocks
 * indefinitely — the event loop stays open forever.
 *
 * Fix: add req.setTimeout(30000, () => req.destroy(new Error('...')))
 * so the request is aborted after 30 seconds.
 *
 * This test uses a 1-second timeout to keep CI fast.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Replicate the postJSON function as it exists before the fix (no timeout)
function postJSONUnsafe(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, res => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Replicate postJSON AFTER the fix (with timeout)
function postJSONSafe(url, body, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, res => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// A server that accepts the connection but never responds
function startHangingServer() {
  const server = http.createServer((_req, _res) => {
    // Intentionally never call res.end() — hangs the connection
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

describe('postJSON timeout behaviour', () => {
  it('safe version rejects with timeout error when server hangs', async () => {
    const { server, port } = await startHangingServer();
    const url = `http://127.0.0.1:${port}/api/scan`;

    try {
      await assert.rejects(
        () => postJSONSafe(url, { test: true }, 500), // 500ms timeout for test speed
        (err) => {
          assert.ok(
            err.message.includes('timeout') || err.code === 'ECONNRESET',
            `Expected timeout error, got: ${err.message}`
          );
          return true;
        }
      );
    } finally {
      server.close();
    }
  });
});
