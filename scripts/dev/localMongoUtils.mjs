import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const LOCAL_MONGO = Object.freeze({
  composeFile: 'docker-compose.dev.yml',
  serviceName: 'mongo',
  containerName: 'site-builder-mongo-dev',
  replicaSet: 'rs0',
  devDbName: 'site_builder_dev',
  testDbName: 'site_builder_test',
  frontendEnvPath: '.env.local',
  serverDevEnvPath: 'server/.env.local',
  serverTestEnvPath: 'server/.env.test',
  devUri: 'mongodb://localhost:27017/site_builder_dev?replicaSet=rs0&directConnection=true',
  testUri: 'mongodb://localhost:27017/site_builder_test?replicaSet=rs0&directConnection=true',
});

export function parseEnvText(text = '') {
  const env = {};
  for (const rawLine of String(text).split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export async function loadEnvFile(filePath, { cwd = process.cwd() } = {}) {
  const resolvedPath = path.resolve(cwd, filePath);
  try {
    const text = await fs.readFile(resolvedPath, 'utf8');
    return {
      exists: true,
      path: resolvedPath,
      values: parseEnvText(text),
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return {
      exists: false,
      path: resolvedPath,
      values: {},
    };
  }
}

export function createCheck(name, status, message, details = {}) {
  return { name, status, message, details };
}

export function summarizeChecks(checks) {
  if (checks.some((check) => check.status === 'FAIL')) return 'FAIL';
  if (checks.some((check) => check.status === 'WARNING')) return 'WARNING';
  return 'PASS';
}

export function formatCheckReport(checks) {
  const status = summarizeChecks(checks);
  const lines = [`Local Mongo preflight: ${status}`, ''];
  for (const check of checks) {
    lines.push(`${check.status}: ${check.name} - ${check.message}`);
  }
  return `${lines.join('\n')}\n`;
}

function mongoHostsFromUri(uri) {
  const withoutProtocol = String(uri || '').replace(/^mongodb(\+srv)?:\/\//iu, '');
  const authority = withoutProtocol.split('/')[0] || '';
  const hostPart = authority.includes('@') ? authority.split('@').pop() : authority;
  return hostPart.split(',').map((host) => host.trim()).filter(Boolean);
}

export function isLocalMongoUri(uri) {
  const hosts = mongoHostsFromUri(uri);
  if (hosts.length === 0) return false;
  return hosts.every((host) => {
    const hostname = host.replace(/^\[/u, '').replace(/\]$/u, '').split(':')[0];
    return ['localhost', '127.0.0.1', '::1'].includes(hostname);
  });
}

export function isSafeLocalDatabaseName(dbName) {
  return [LOCAL_MONGO.devDbName, LOCAL_MONGO.testDbName].includes(String(dbName || '').trim());
}

export function assertSafeLocalMongoTarget({ uri, dbName }) {
  if (!isLocalMongoUri(uri)) {
    throw new Error(`Refusing non-local MongoDB URI: ${uri || '(empty)'}`);
  }
  if (!isSafeLocalDatabaseName(dbName)) {
    throw new Error(`Refusing to reset non-local database: ${dbName || '(empty)'}`);
  }
}

export async function runCommand(command, args = [], options = {}) {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd || process.cwd(),
    timeout: options.timeout || 10000,
    maxBuffer: options.maxBuffer || 1024 * 1024,
    env: options.env || process.env,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

export function requireResetConfirmation(argv = []) {
  if (!argv.includes('--confirm-local-reset')) {
    throw new Error('Refusing reset without --confirm-local-reset.');
  }
}
