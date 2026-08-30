#!/usr/bin/env node
/**
 * Runs the smallest stateful release smoke against an extracted Data API
 * payload. The caller supplies only synthetic MongoDB connection details.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key?.startsWith('--') || !argv[index + 1]) throw new Error(`Expected --name value, got ${key || ''}`);
    args[key.slice(2)] = argv[index + 1];
  }
  return args;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  return { status: response.status, body };
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 20000;
  let lastError = '';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Packaged API exited before health check: ${lastError}`);
    try {
      const health = await request(`${baseUrl}/healthz`);
      if (health.status === 200 && health.body.ok === true) return health;
    } catch (error) { lastError = error.message; }
    await delay(150);
  }
  throw new Error(`Packaged API did not become healthy: ${lastError}`);
}

function startApi({ apiRoot, node, env, logFile }) {
  const log = [];
  const child = spawn(node, ['app/server/index.js'], {
    cwd: apiRoot,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => log.push(String(chunk)));
  const persistLog = () => fs.writeFile(logFile, log.join(''));
  child.once('exit', persistLog);
  return { child, log, persistLog };
}

async function stopApi(instance) {
  if (instance.child.exitCode !== null) return;
  instance.child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolve) => instance.child.once('exit', resolve)),
    delay(10000).then(() => false),
  ]);
  if (exited === false && instance.child.exitCode === null) instance.child.kill('SIGKILL');
  await instance.persistLog();
}

async function main() {
  const args = parseArgs(process.argv);
  for (const required of ['api-root', 'mongodb-uri', 'mongodb-db', 'result']) if (!args[required]) throw new Error(`--${required} is required`);
  const apiRoot = path.resolve(args['api-root']);
  const resultFile = path.resolve(args.result);
  const port = Number(args.port || 43017);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port must be a valid TCP port');
  const apiKey = 'synthetic-release-smoke-key';
  const baseUrl = `http://127.0.0.1:${port}`;
  const entityId = `release-smoke-${Date.now()}`;
  const env = {
    NODE_ENV: 'production', STORAGE_BACKEND: 'mongo', MONGODB_URI: args['mongodb-uri'], MONGODB_DB_NAME: args['mongodb-db'],
    SERVER_PORT: String(port), ADMIN_API_KEY: apiKey, CORS_ORIGINS: 'http://localhost', REQUIRE_STARTUP_COLLECTIONS: 'true',
  };
  await fs.mkdir(path.dirname(resultFile), { recursive: true });
  const first = startApi({ apiRoot, node: args.node || process.execPath, env, logFile: `${resultFile}.first.log` });
  try {
    const health = await waitForHealth(baseUrl, first.child);
    const sites = await request(`${baseUrl}/api/sites`, { headers: { 'x-api-key': apiKey } });
    if (sites.status !== 200 || sites.body.ok !== true) throw new Error('Authenticated GET /api/sites failed');
    const write = await request(`${baseUrl}/api/sites/synth-site/data/release/${entityId}`, {
      method: 'PUT', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'x-actor': 'release-smoke' },
      body: JSON.stringify({ expectedVersion: 0, data: { marker: 'synthetic-release-smoke', persisted: true } }),
    });
    if (write.status !== 200 || write.body.document?.version !== 1) throw new Error('Valid synthetic write did not create version 1');
    const conflict = await request(`${baseUrl}/api/sites/synth-site/data/release/${entityId}`, {
      method: 'PUT', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'x-actor': 'release-smoke' },
      body: JSON.stringify({ expectedVersion: 0, data: { marker: 'stale-write' } }),
    });
    if (conflict.status !== 409 || conflict.body.error?.code !== 'conflict') throw new Error('Stale expectedVersion did not return a version conflict');
    await stopApi(first);
    const restarted = startApi({ apiRoot, node: args.node || process.execPath, env, logFile: `${resultFile}.restart.log` });
    try {
      await waitForHealth(baseUrl, restarted.child);
      const persisted = await request(`${baseUrl}/api/sites/synth-site/data/release/${entityId}`, { headers: { 'x-api-key': apiKey } });
      if (persisted.status !== 200 || persisted.body.document?.version !== 1 || persisted.body.document?.data?.persisted !== true) throw new Error('Write did not persist after packaged API restart');
      const result = { ok: true, health: health.status, authenticatedList: sites.status, write: write.status, staleExpectedVersion: conflict.status, restartPersistence: persisted.status, entityId };
      await fs.writeFile(resultFile, `${JSON.stringify(result, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } finally { await stopApi(restarted); }
  } catch (error) {
    await stopApi(first);
    throw error;
  }
}

main().catch((error) => { process.stderr.write(`Packaged API smoke failed: ${error.message}\n`); process.exitCode = 1; });
