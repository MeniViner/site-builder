#!/usr/bin/env node
import { MongoClient } from 'mongodb';
import {
  LOCAL_MONGO,
  createCheck,
  formatCheckReport,
  isLocalMongoUri,
  loadEnvFile,
  runCommand,
  summarizeChecks,
} from './localMongoUtils.mjs';
import { parseCliArgs } from '../sp-env.js';

function normalizeOrigin(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = raw.match(/^https?:\/\//i) ? new URL(raw) : new URL(`https://${raw}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

function parseCorsOrigins(value = '') {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .map(normalizeOrigin)
    .filter(Boolean);
}

function statusFromCheck(name, ok, message, details = {}) {
  return createCheck(name, ok ? 'PASS' : 'FAIL', message, details);
}

async function checkCommand(name, command, args, okMessage, failPrefix) {
  try {
    const result = await runCommand(command, args);
    return statusFromCheck(name, true, okMessage, { stdout: result.stdout.trim() });
  } catch (error) {
    return statusFromCheck(name, false, `${failPrefix}: ${error.message}`);
  }
}

async function checkDockerContainer() {
  try {
    const result = await runCommand('docker', [
      'compose',
      '-f',
      LOCAL_MONGO.composeFile,
      'ps',
      '--status',
      'running',
      '--services',
    ]);
    const services = result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    if (services.includes(LOCAL_MONGO.serviceName)) {
      return createCheck('Mongo container', 'PASS', `${LOCAL_MONGO.containerName} is running`);
    }
    return createCheck('Mongo container', 'FAIL', `Service "${LOCAL_MONGO.serviceName}" is not running. Run npm run dev:mongo:up.`);
  } catch (error) {
    return createCheck('Mongo container', 'FAIL', `Could not inspect Docker Compose services: ${error.message}`);
  }
}

async function checkMongoReachable(name, uri, dbName) {
  if (!uri || !dbName) {
    return createCheck(name, 'FAIL', 'MONGODB_URI and MONGODB_DB_NAME are required.');
  }
  if (!isLocalMongoUri(uri)) {
    return createCheck(name, 'FAIL', `Refusing non-local MongoDB URI: ${uri}`);
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
  try {
    await client.connect();
    await client.db(dbName).command({ ping: 1 });
    return createCheck(name, 'PASS', `Mongo reachable, database=${dbName}`);
  } catch (error) {
    return createCheck(name, 'FAIL', `Mongo not reachable for ${dbName}: ${error.message}`);
  } finally {
    await client.close().catch(() => {});
  }
}

async function checkHttpJson(name, url, init = {}) {
  try {
    const response = await fetch(url, init);
    if (!response.ok) {
      return createCheck(name, 'FAIL', `${url} returned HTTP ${response.status}`);
    }

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (payload?.ok !== true) {
      return createCheck(name, 'FAIL', `${url} health body is not ok`);
    }

    return createCheck(name, 'PASS', `Reachable: ${url}`);
  } catch (error) {
    return createCheck(name, 'FAIL', `${url} check failed: ${error.message}`);
  }
}

async function checkProtectedApiSites(name, baseApiUrl, apiKey) {
  const endpoint = `${baseApiUrl.replace(/\/+$/g, '')}/api/sites`;
  try {
    const noAuthResponse = await fetch(endpoint);
    if (noAuthResponse.status !== 401 && noAuthResponse.status !== 403) {
      return createCheck(name, 'FAIL', `${endpoint} should require auth, got status ${noAuthResponse.status}`);
    }
  } catch (error) {
    return createCheck(name, 'FAIL', `${endpoint} auth check failed: ${error.message}`);
  }

  if (!apiKey) {
    return createCheck('API key provided', 'WARNING', 'No API key provided for deep protected endpoint check.');
  }

  try {
    const response = await fetch(endpoint, {
      headers: {
        'X-API-Key': apiKey,
      },
    });
    if (!response.ok) {
      return createCheck(name, 'FAIL', `${endpoint} with key failed: ${response.status}`);
    }
    return createCheck(name, 'PASS', `Protected endpoint accessible with provided API key`);
  } catch (error) {
    return createCheck(name, 'FAIL', `${endpoint} with key failed: ${error.message}`);
  }
}

async function main() {
    const cli = parseCliArgs(process.argv.slice(2));
  const sharepointOrigin = normalizeOrigin(cli['sharepoint-origin'] || cli['sp-origin'] || '');
  const expectedBackendUrl = normalizeOrigin(cli['backend-url'] || cli['backend'] || '');
  const apiKey = String(cli['api-key'] || '').trim();

  const [frontendEnv, serverDevEnv, serverTestEnv] = await Promise.all([
    loadEnvFile(LOCAL_MONGO.frontendEnvPath),
    loadEnvFile(LOCAL_MONGO.serverDevEnvPath),
    loadEnvFile(LOCAL_MONGO.serverTestEnvPath),
  ]);

  const checks = [];
  checks.push(await checkCommand('Docker installed', 'docker', ['--version'], 'Docker CLI is available', 'Docker CLI check failed'));
  checks.push(await checkCommand('Docker daemon', 'docker', ['info'], 'Docker daemon is running', 'Docker daemon check failed'));
  checks.push(await checkCommand('Docker Compose', 'docker', ['compose', 'version'], 'docker compose is available', 'Docker compose check failed'));
  checks.push(await checkDockerContainer());

  checks.push(frontendEnv.exists
    ? createCheck('Frontend env', 'PASS', `${LOCAL_MONGO.frontendEnvPath} found`)
    : createCheck('Frontend env', 'FAIL', `Missing ${LOCAL_MONGO.frontendEnvPath}. Copy .env.local.example.`));

  checks.push(serverDevEnv.exists
    ? createCheck('Backend dev env', 'PASS', `${LOCAL_MONGO.serverDevEnvPath} found`)
    : createCheck('Backend dev env', 'FAIL', `Missing ${LOCAL_MONGO.serverDevEnvPath}. Copy server/.env.local.example.`));
  checks.push(serverTestEnv.exists
    ? createCheck('Backend test env', 'PASS', `${LOCAL_MONGO.serverTestEnvPath} found`)
    : createCheck('Backend test env', 'FAIL', `Missing ${LOCAL_MONGO.serverTestEnvPath}. Copy server/.env.test.example.`));

  const frontendMongo = String(frontendEnv.values.VITE_STORAGE_BACKEND || '').trim() === 'mongo';
  const configuredBackendUrl = frontendEnv.values.VITE_BACKEND_API_URL || '';
  const targetBackendUrl = expectedBackendUrl || configuredBackendUrl;

  checks.push(frontendMongo
    ? createCheck('Frontend Mongo mode', 'PASS', 'VITE_STORAGE_BACKEND=mongo')
    : createCheck('Frontend Mongo mode', 'WARNING', 'VITE_STORAGE_BACKEND is not mongo in .env.local'));
  checks.push(frontendMongo && !targetBackendUrl
    ? createCheck('Frontend backend URL', 'FAIL', 'VITE_BACKEND_API_URL is required when VITE_STORAGE_BACKEND=mongo')
    : frontendMongo
      ? createCheck('Frontend backend URL', 'PASS', `VITE_BACKEND_API_URL is set: ${targetBackendUrl}`)
      : createCheck('Frontend backend URL', 'WARNING', 'VITE_BACKEND_API_URL is only required for Mongo frontend mode'));

  const cors = String(serverDevEnv.values.CORS_ORIGINS || '');
  const localOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const localCorsOk = localOrigins.every((origin) => parseCorsOrigins(cors).includes(origin));
  checks.push(localCorsOk
    ? createCheck('CORS localhost', 'PASS', 'CORS_ORIGINS includes Vite localhost origins')
    : createCheck('CORS localhost', 'FAIL', 'CORS_ORIGINS must include http://localhost:5173 and http://127.0.0.1:5173'));

  if (sharepointOrigin) {
    checks.push(parseCorsOrigins(cors).includes(sharepointOrigin)
      ? createCheck('CORS SharePoint origin', 'PASS', `CORS_ORIGINS includes ${sharepointOrigin}`)
      : createCheck('CORS SharePoint origin', 'FAIL', `CORS_ORIGINS missing sharepoint origin: ${sharepointOrigin}`));
  } else {
    checks.push(createCheck('CORS SharePoint origin', 'WARNING', 'No --sharepoint-origin provided for closed SharePoint check.')); 
  }

  const testBackend = targetBackendUrl && targetBackendUrl.replace(/\/+$/g, '');
  checks.push(targetBackendUrl
    ? createCheck('Configured backend URL', 'PASS', `Backend URL: ${targetBackendUrl}`)
    : createCheck('Configured backend URL', 'FAIL', 'Missing backend URL for local check.'));

  checks.push(String(frontendEnv.values.VITE_AUTO_DEPLOY || '').trim() === 'false'
    ? createCheck('Frontend auto deploy', 'PASS', 'VITE_AUTO_DEPLOY=false')
    : createCheck('Frontend auto deploy', 'FAIL', 'VITE_AUTO_DEPLOY must be false for local Mongo dev'));

  checks.push(serverDevEnv.values.ADMIN_API_KEY
    ? createCheck('Backend dev API key', 'PASS', 'ADMIN_API_KEY is set for dev')
    : createCheck('Backend dev API key', 'FAIL', 'ADMIN_API_KEY is missing in server/.env.local'));
  checks.push(serverTestEnv.values.ADMIN_API_KEY
    ? createCheck('Backend test API key', 'PASS', 'ADMIN_API_KEY is set for test')
    : createCheck('Backend test API key', 'FAIL', 'ADMIN_API_KEY is missing in server/.env.test'));

  const devUri = serverDevEnv.values.MONGODB_URI || '';
  const devDbName = serverDevEnv.values.MONGODB_DB_NAME || '';
  const testUri = serverTestEnv.values.MONGODB_URI || '';
  const testDbName = serverTestEnv.values.MONGODB_DB_NAME || '';
  checks.push(await checkMongoReachable('Mongo dev database', devUri, devDbName));
  checks.push(await checkMongoReachable('Mongo test database', testUri, testDbName));

  if (testBackend) {
    checks.push(await checkHttpJson('Backend healthz', `${testBackend}/healthz`));
    checks.push(await checkHttpJson('Backend api healthz', `${testBackend}/api/healthz`));
    checks.push(await checkProtectedApiSites('Backend api/sites', testBackend, apiKey || serverDevEnv.values.ADMIN_API_KEY || ''));
  } else {
    checks.push(createCheck('Backend healthz', 'FAIL', 'Cannot check backend endpoint without backend URL'));
    checks.push(createCheck('Backend api healthz', 'FAIL', 'Cannot check backend endpoint without backend URL'));
    checks.push(createCheck('Protected API endpoint', 'FAIL', 'Cannot check protected endpoint without backend URL'));
  }

  const report = formatCheckReport(checks);
  process.stdout.write(report);
  if (summarizeChecks(checks) === 'FAIL') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[dev:closed-local:check] ${error.message}`);
  process.exit(1);
});
