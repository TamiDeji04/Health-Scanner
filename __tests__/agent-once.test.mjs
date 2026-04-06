/**
 * Integration test for agent.mjs --once flag.
 *
 * Bug: The agent entry point calls tick() without await:
 *   tick();
 *   if (!RUN_ONCE) { setInterval(...) }
 *
 * With --once, Node.js exits as soon as the synchronous code finishes —
 * before the async tick() (which includes an HTTP POST) completes.
 * Result: the dashboard never receives any data.
 *
 * Fix: wrap the entry point in an async IIFE and await tick():
 *   (async () => {
 *     await tick();
 *     if (!RUN_ONCE) { setInterval(...) }
 *   })();
 *
 * This test:
 * 1. Spins up a minimal HTTP server on localhost that records incoming POSTs
 * 2. Runs agent.mjs as a child process with --once pointing at that server
 * 3. Waits for the child to exit
 * 4. Asserts the server received exactly 1 POST before the process exited
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_PATH = path.resolve(__dirname, '../agent.mjs');

function startMockServer() {
  const requests = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        try { requests.push(JSON.parse(body)); } catch (_) { requests.push(body); }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'test-id', overallStatus: 'normal' }));
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, requests, port });
    });
  });
}

function runAgent(url) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [AGENT_PATH, '--url', url, '--once'], {
      env: { ...process.env, NODE_ENV: 'test' },
      timeout: 15000,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.on('error', reject);
  });
}

describe('agent --once integration', () => {
  let server, requests, port;

  before(async () => {
    ({ server, requests, port } = await startMockServer());
  });

  after(() => {
    server.close();
  });

  it('sends exactly one POST and exits cleanly', async () => {
    const url = `http://127.0.0.1:${port}`;
    const { code } = await runAgent(url);

    // Agent should exit with code 0
    assert.equal(code, 0, 'agent should exit cleanly');

    // Server must have received exactly 1 POST — proves tick() completed
    assert.equal(requests.length, 1, `expected 1 POST but got ${requests.length}`);

    // The payload should have the expected shape
    const payload = requests[0];
    assert.ok(payload.machineId, 'payload should have machineId');
    assert.ok(Array.isArray(payload.metrics), 'payload.metrics should be an array');
    assert.ok(payload.metrics.length > 0, 'payload should contain metrics');
  });
});
