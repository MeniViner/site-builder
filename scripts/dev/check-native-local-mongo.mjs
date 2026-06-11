#!/usr/bin/env node
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import {
  LOCAL_MONGO,
  createCheck,
  formatCheckReport,
  isLocalMongoUri,
  isSafeLocalDatabaseName,
  loadEnvFile,
  runCommand,
  summarizeChecks,
} from './localMongoUtils.mjs';
import { parseCliArgs } from '../sp-env.js';

function normalizeOrigin(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const normalized = raw.match(/^https?:\/\//i) ? raw : `https://${raw}`;
    const parsed = new URL(normalized);
    return `${parsed.protocol}//${parsed.host}`;
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
    const result = await runCommand(command, args, { timeout: 7000 });
    return statusFromCheck(name, true, okMessage, { stdout: result.stdout.trim() });
  } catch (error) {
    return statusFromCheck(name, false, `${failPrefix}: ${error.message}`);
  }
}

function selectEnvFile(primary, fallback, label) {
  if (primary.exists) {
    return {
      ...primary,
      source: `${label} (native)`,
    };
  }
  if (!fallback.exists) {
    throw new Error(`Missing both ${primary.path} and ${fallback.path}`);
  }
  return {
    ...fallback,
    source: `${label} (standard)`,
  };
}

export async function checkMongoEnvDatabase(name, uri, dbName) {
  if (!uri || !dbName) {
    return createCheck(name, 'FAIL', 'MONGODB_URI and MONGODB_DB_NAME are required.');
  }

  if (!isLocalMongoUri(uri)) {
    return createCheck(name, 'FAIL', `Refusing non-local MongoDB URI: ${uri}`);
  }

  if (!isSafeLocalDatabaseName(dbName)) {
    return createCheck(name, 'FAIL', `Refusing to use unexpected database name: ${dbName}`);
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 3000,
  });

  try {
    await client.connect();
    const hello = await client.db('admin').command({ hello: 1 });

    await client.db(dbName).command({ ping: 1 });
    return createCheck(
      name,
      'PASS',
      hello?.setName
        ? `Mongo reachable with replica set ${hello.setName} for ${dbName}`
        : `Mongo reachable as standalone server for ${dbName}`,
    );
  } catch (error) {
    return createCheck(name, 'FAIL', `Mongo not reachable for ${dbName}: ${error.message}`);
  } finally {
    await client.close().catch(() => {});
  }
}

export async function runNativeMongoCheck(args = process.argv.slice(2)) {
  const cli = parseCliArgs(args);
  const sharepointOrigin = normalizeOrigin(cli['sharepoint-origin'] || cli['sp-origin'] || '');

  const [
    frontendEnv,
    serverDevNative,
    serverDevStandard,
    serverTestNative,
    serverTestStandard,
  ] = await Promise.all([
    loadEnvFile(LOCAL_MONGO.frontendEnvPath),
    loadEnvFile('server/.env.local.native'),
    loadEnvFile(LOCAL_MONGO.serverDevEnvPath),
    loadEnvFile('server/.env.test.native'),
    loadEnvFile(LOCAL_MONGO.serverTestEnvPath),
  ]);

  const checks = [];
  checks.push(await checkCommand('mongosh CLI', 'mongosh', ['--version'], 'mongosh is installed', 'mongosh check failed'));

  const serverDevEnv = selectEnvFile(serverDevNative, serverDevStandard, 'server dev env');
  const serverTestEnv = selectEnvFile(serverTestNative, serverTestStandard, 'server test env');

  checks.push(serverDevEnv.exists
    ? createCheck('Server dev env', 'PASS', `${serverDevEnv.path} found (${serverDevEnv.source})`)
    : createCheck('Server dev env', 'FAIL', 'Missing both server/.env.local and server/.env.local.native.'));
  checks.push(serverTestEnv.exists
    ? createCheck('Server test env', 'PASS', `${serverTestEnv.path} found (${serverTestEnv.source})`)
    : createCheck('Server test env', 'FAIL', 'Missing both server/.env.test and server/.env.test.native.'));
  checks.push(frontendEnv.exists
    ? createCheck('Frontend env', 'PASS', `${LOCAL_MONGO.frontendEnvPath} found`)
    : createCheck('Frontend env', 'FAIL', `Missing ${LOCAL_MONGO.frontendEnvPath}. Copy .env.local.example.`));

  const frontendMongo = String(frontendEnv.values.VITE_STORAGE_BACKEND || '').trim().toLowerCase() === 'mongo';
  if (frontendMongo) {
    checks.push(createCheck('Frontend Mongo mode', 'PASS', 'VITE_STORAGE_BACKEND=mongo'));
    checks.push(frontendEnv.values.VITE_BACKEND_API_URL
      ? createCheck('Frontend backend URL', 'PASS', `VITE_BACKEND_API_URL set: ${frontendEnv.values.VITE_BACKEND_API_URL}`)
      : createCheck('Frontend backend URL', 'FAIL', 'VITE_BACKEND_API_URL is required when VITE_STORAGE_BACKEND=mongo'));
  } else {
    checks.push(createCheck('Frontend Mongo mode', 'WARNING', 'VITE_STORAGE_BACKEND is not mongo in .env.local'));
    checks.push(createCheck('Frontend backend URL', 'WARNING', 'VITE_BACKEND_API_URL is only required for Mongo frontend mode'));
  }

  checks.push(String(frontendEnv.values.VITE_AUTO_DEPLOY || '').trim() === 'false'
    ? createCheck('Frontend auto deploy', 'PASS', 'VITE_AUTO_DEPLOY=false')
    : createCheck('Frontend auto deploy', 'FAIL', 'VITE_AUTO_DEPLOY must be false for local Mongo dev'));

  const corsOrigins = parseCorsOrigins(serverDevEnv.values.CORS_ORIGINS || '');
  const localhostOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const hasLocalCors = localhostOrigins.every((origin) => corsOrigins.includes(origin));
  checks.push(hasLocalCors
    ? createCheck('CORS localhost', 'PASS', 'CORS_ORIGINS includes localhost origins')
    : createCheck('CORS localhost', 'FAIL', 'CORS_ORIGINS must include http://localhost:5173 and http://127.0.0.1:5173'));

  if (sharepointOrigin) {
    checks.push(corsOrigins.includes(sharepointOrigin)
      ? createCheck('CORS SharePoint origin', 'PASS', `CORS_ORIGINS includes ${sharepointOrigin}`)
      : createCheck('CORS SharePoint origin', 'FAIL', `CORS_ORIGINS missing sharepoint origin: ${sharepointOrigin}`));
  } else {
    checks.push(createCheck('CORS SharePoint origin', 'WARNING', 'No --sharepoint-origin provided'));
  }

  checks.push(createCheck(
    'ADMIN_API_KEY local dev',
    serverDevEnv.values.ADMIN_API_KEY ? 'PASS' : 'FAIL',
    serverDevEnv.values.ADMIN_API_KEY ? 'ADMIN_API_KEY is set for dev' : 'ADMIN_API_KEY is missing in selected local dev env file',
  ));

  checks.push(createCheck(
    'ADMIN_API_KEY local test',
    serverTestEnv.values.ADMIN_API_KEY ? 'PASS' : 'FAIL',
    serverTestEnv.values.ADMIN_API_KEY ? 'ADMIN_API_KEY is set for test' : 'ADMIN_API_KEY is missing in selected local test env file',
  ));

  checks.push(await checkMongoEnvDatabase('Mongo dev database', serverDevEnv.values.MONGODB_URI, serverDevEnv.values.MONGODB_DB_NAME));
  checks.push(await checkMongoEnvDatabase('Mongo test database', serverTestEnv.values.MONGODB_URI, serverTestEnv.values.MONGODB_DB_NAME));

  const report = formatCheckReport(checks);
  process.stdout.write(report);

  if (summarizeChecks(checks) === 'FAIL') {
    process.exitCode = 1;
  }
}

export function isNativeCheckScriptInvocation() {
  const activeArg = process.argv[1];
  if (!activeArg) return false;
  const normalizedActive = path.resolve(activeArg);
  const normalizedCurrent = path.resolve(fileURLToPath(import.meta.url));
  return normalizedActive === normalizedCurrent;
}

if (isNativeCheckScriptInvocation()) {
  runNativeMongoCheck().catch((error) => {
    if (error?.message?.startsWith('Missing both server/.env')) {
      process.stdout.write(`Local Native Mongo preflight: FAIL\n${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    console.error(`[dev:mongo:native:check] ${error.message}`);
    process.exit(1);
  });
}
