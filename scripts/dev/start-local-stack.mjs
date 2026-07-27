#!/usr/bin/env node
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import { isLocalMongoUri, loadEnvFile } from './localMongoUtils.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const composeFile = path.join(projectRoot, 'docker-compose.dev.yml');
const viteBin = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const frontendEnvPath = path.join(projectRoot, '.env.local');
const serverEnvPath = path.join(projectRoot, 'server', '.env.local');
const children = new Set();

function fail(message) {
  throw new Error(`[local-dev] ${message}`);
}

async function canReachMongo(uri, dbName) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 1500 });
  try {
    await client.connect();
    await client.db(dbName).command({ ping: 1 });
    return true;
  } catch {
    return false;
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function ensureMongo(serverEnv) {
  const uri = String(serverEnv.MONGODB_URI || '').trim();
  const dbName = String(serverEnv.MONGODB_DB_NAME || '').trim();
  if (!uri || !dbName) fail('server/.env.local must define MONGODB_URI and MONGODB_DB_NAME.');
  if (!isLocalMongoUri(uri)) fail('npm run dev refuses to start against a non-local Mongo URI.');

  if (await canReachMongo(uri, dbName)) {
    console.log(`[local-dev] Reusing reachable local Mongo database: ${dbName}`);
    return;
  }

  console.log('[local-dev] Starting local Mongo with Docker Compose...');
  const result = spawnSync('docker', ['compose', '-f', composeFile, 'up', '-d'], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) fail(`Docker Compose could not start: ${result.error.message}`);
  if (result.status !== 0) fail(`Docker Compose exited with code ${result.status ?? 1}.`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await canReachMongo(uri, dbName)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail('Mongo did not become reachable within 20 seconds.');
}

async function backendIsReady(baseUrl, apiKey) {
  try {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/u, '');
    const response = await fetch(`${normalizedBaseUrl}/healthz`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1200),
    });
    if (!response.ok) return false;
    const payload = await response.json();
    if (payload?.ok !== true || payload?.storageBackend !== 'mongo') return false;

    const authenticatedResponse = await fetch(`${normalizedBaseUrl}/api/sites`, {
      cache: 'no-store',
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(1200),
    });
    return authenticatedResponse.ok;
  } catch {
    return false;
  }
}

function spawnChild(command, args, env) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

function stopChildren(signal = 'SIGTERM') {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

async function startBackend(serverEnv, backendUrl) {
  const apiKey = String(serverEnv.ADMIN_API_KEY || '');
  if (await backendIsReady(backendUrl, apiKey)) {
    console.log(`[local-dev] Reusing Site Builder API at ${backendUrl}`);
    return null;
  }

  const child = spawnChild(process.execPath, ['--watch', 'server/index.js'], {
    ...process.env,
    ...serverEnv,
  });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await backendIsReady(backendUrl, apiKey)) return child;
    if (child.exitCode !== null) fail(`Site Builder API exited with code ${child.exitCode}.`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail(`Site Builder API did not become ready at ${backendUrl}.`);
}

function validateLocalConfiguration(frontendEnv, serverEnv) {
  if (frontendEnv.VITE_STORAGE_BACKEND !== 'mongo') {
    fail('The full local stack requires VITE_STORAGE_BACKEND=mongo in .env.local. Use npm run dev:vite for TXT/localStorage development.');
  }
  if (serverEnv.STORAGE_BACKEND !== 'mongo') {
    fail('server/.env.local must use STORAGE_BACKEND=mongo.');
  }
  const backendUrl = String(frontendEnv.VITE_BACKEND_API_URL || '').replace(/\/+$/u, '');
  if (!backendUrl) fail('.env.local must define VITE_BACKEND_API_URL.');
  if (!frontendEnv.VITE_SITE_ID) fail('.env.local must define VITE_SITE_ID.');
  if (!frontendEnv.VITE_SITE_BUILDER_DEV_API_KEY) fail('.env.local must define VITE_SITE_BUILDER_DEV_API_KEY.');
  if (frontendEnv.VITE_SITE_BUILDER_DEV_API_KEY !== serverEnv.ADMIN_API_KEY) {
    fail('VITE_SITE_BUILDER_DEV_API_KEY and ADMIN_API_KEY must match.');
  }
  if (frontendEnv.VITE_AUTO_DEPLOY !== 'false') fail('VITE_AUTO_DEPLOY must be false in local development.');
  return backendUrl;
}

async function main() {
  const [frontendFile, serverFile] = await Promise.all([
    loadEnvFile(frontendEnvPath),
    loadEnvFile(serverEnvPath),
  ]);
  if (!frontendFile.exists) fail('Missing .env.local. Copy .env.local.example first.');
  if (!serverFile.exists) fail('Missing server/.env.local. Copy server/.env.local.example first.');

  const backendUrl = validateLocalConfiguration(frontendFile.values, serverFile.values);
  await ensureMongo(serverFile.values);
  await startBackend(serverFile.values, backendUrl);

  console.log('[local-dev] Mongo and API are ready. Starting Vite...');
  const vite = spawnChild(process.execPath, [viteBin, '--host', '127.0.0.1', ...process.argv.slice(2)], {
    ...process.env,
    ...frontendFile.values,
  });

  await new Promise((resolve, reject) => {
    vite.once('error', reject);
    vite.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Vite stopped by ${signal}.`));
      else if (code && code !== 0) reject(new Error(`Vite exited with code ${code}.`));
      else resolve();
    });
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopChildren(signal);
    process.exit(0);
  });
}

main()
  .catch((error) => {
    stopChildren();
    console.error(error.message || error);
    process.exitCode = 1;
  });
