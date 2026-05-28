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

async function checkCommand(name, command, args, okMessage, failPrefix) {
  try {
    const result = await runCommand(command, args);
    return createCheck(name, 'PASS', okMessage, { stdout: result.stdout.trim() });
  } catch (error) {
    return createCheck(name, 'FAIL', `${failPrefix}: ${error.message}`);
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

async function main() {
  const [frontendEnv, serverDevEnv, serverTestEnv] = await Promise.all([
    loadEnvFile(LOCAL_MONGO.frontendEnvPath),
    loadEnvFile(LOCAL_MONGO.serverDevEnvPath),
    loadEnvFile(LOCAL_MONGO.serverTestEnvPath),
  ]);

  const checks = [];
  checks.push(await checkCommand('Docker installed', 'docker', ['--version'], 'Docker CLI is available', 'Docker CLI check failed'));
  checks.push(await checkCommand('Docker daemon', 'docker', ['info'], 'Docker daemon is running', 'Docker daemon check failed'));
  checks.push(await checkCommand('Docker Compose', 'docker', ['compose', 'version'], 'docker compose is available', 'Docker Compose check failed'));
  checks.push(await checkDockerContainer());

  checks.push(serverDevEnv.exists
    ? createCheck('Backend dev env', 'PASS', `${LOCAL_MONGO.serverDevEnvPath} found`)
    : createCheck('Backend dev env', 'FAIL', `Missing ${LOCAL_MONGO.serverDevEnvPath}. Copy server/.env.local.example.`));
  checks.push(serverTestEnv.exists
    ? createCheck('Backend test env', 'PASS', `${LOCAL_MONGO.serverTestEnvPath} found`)
    : createCheck('Backend test env', 'FAIL', `Missing ${LOCAL_MONGO.serverTestEnvPath}. Copy server/.env.test.example.`));
  checks.push(frontendEnv.exists
    ? createCheck('Frontend env', 'PASS', `${LOCAL_MONGO.frontendEnvPath} found`)
    : createCheck('Frontend env', 'FAIL', `Missing ${LOCAL_MONGO.frontendEnvPath}. Copy .env.local.example.`));

  const devUri = serverDevEnv.values.MONGODB_URI || '';
  const devDbName = serverDevEnv.values.MONGODB_DB_NAME || '';
  const testUri = serverTestEnv.values.MONGODB_URI || '';
  const testDbName = serverTestEnv.values.MONGODB_DB_NAME || '';

  checks.push(serverDevEnv.values.ADMIN_API_KEY
    ? createCheck('Backend dev API key', 'PASS', 'ADMIN_API_KEY is set for dev')
    : createCheck('Backend dev API key', 'FAIL', 'ADMIN_API_KEY is missing in server/.env.local'));
  checks.push(serverTestEnv.values.ADMIN_API_KEY
    ? createCheck('Backend test API key', 'PASS', 'ADMIN_API_KEY is set for test')
    : createCheck('Backend test API key', 'FAIL', 'ADMIN_API_KEY is missing in server/.env.test'));

  const cors = String(serverDevEnv.values.CORS_ORIGINS || '');
  checks.push(cors.includes('http://localhost:5173') && cors.includes('http://127.0.0.1:5173')
    ? createCheck('CORS localhost', 'PASS', 'CORS_ORIGINS includes Vite localhost origins')
    : createCheck('CORS localhost', 'FAIL', 'CORS_ORIGINS must include http://localhost:5173 and http://127.0.0.1:5173'));

  const frontendMongo = String(frontendEnv.values.VITE_STORAGE_BACKEND || '').trim() === 'mongo';
  checks.push(frontendMongo
    ? createCheck('Frontend Mongo mode', 'PASS', 'VITE_STORAGE_BACKEND=mongo')
    : createCheck('Frontend Mongo mode', 'WARNING', 'VITE_STORAGE_BACKEND is not mongo in .env.local'));
  checks.push(!frontendEnv.exists
    ? createCheck('Frontend backend URL', 'FAIL', 'Cannot check VITE_BACKEND_API_URL because .env.local is missing')
    : frontendMongo && !frontendEnv.values.VITE_BACKEND_API_URL
      ? createCheck('Frontend backend URL', 'FAIL', 'VITE_BACKEND_API_URL is required when VITE_STORAGE_BACKEND=mongo')
      : !frontendMongo
        ? createCheck('Frontend backend URL', 'WARNING', 'VITE_BACKEND_API_URL is only required for Mongo frontend mode')
        : createCheck('Frontend backend URL', 'PASS', 'VITE_BACKEND_API_URL is set'));
  checks.push(String(frontendEnv.values.VITE_AUTO_DEPLOY || '').trim() === 'false'
    ? createCheck('Frontend auto deploy', 'PASS', 'VITE_AUTO_DEPLOY=false')
    : createCheck('Frontend auto deploy', 'FAIL', 'VITE_AUTO_DEPLOY must be false for local Mongo dev'));

  checks.push(await checkMongoReachable('Mongo dev database', devUri, devDbName));
  checks.push(await checkMongoReachable('Mongo test database', testUri, testDbName));

  const report = formatCheckReport(checks);
  process.stdout.write(report);
  if (summarizeChecks(checks) === 'FAIL') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[dev:mongo:check] ${error.message}`);
  process.exit(1);
});
