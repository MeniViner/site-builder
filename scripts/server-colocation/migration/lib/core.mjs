import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const TRANSFER_FORMAT_VERSION = 1;
export const REQUIRED_MAPPING_FIELDS = Object.freeze([
  'hubSiteId', 'siteIdentityKey', 'siteCode', 'builderSiteId', 'runtimeSiteId',
  'sourceDatabase', 'targetDatabase', 'safeCollectionName', 'physicalCollection',
  'sharePointSiteUrl', 'migrationState', 'evidenceHash',
]);

export function parseArgs(argv = process.argv.slice(2)) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) { result._.push(token); continue; }
    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    if (inlineValue !== undefined) result[rawKey] = inlineValue;
    else if (argv[index + 1] && !argv[index + 1].startsWith('--')) result[rawKey] = argv[++index];
    else result[rawKey] = true;
  }
  return result;
}

export function required(value, label) {
  if (!String(value || '').trim()) throw new Error(`${label} is required.`);
  return String(value).trim();
}

export function assertDirectoryIsNew(directory) {
  return fs.access(directory).then(
    () => { throw new Error(`Refusing to write into existing directory: ${directory}`); },
    async (error) => {
      if (error?.code !== 'ENOENT') throw error;
      await fs.mkdir(directory, { recursive: true });
      return directory;
    },
  );
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

export async function writeJsonNew(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function sha256File(filePath) {
  return sha256(await fs.readFile(filePath));
}

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function canonicalHash(value) {
  return sha256(canonicalJson(value));
}

export function redactMongoUri(value) {
  try {
    const uri = new URL(value);
    const auth = uri.username || uri.password ? '<redacted>@' : '';
    return `${uri.protocol}//${auth}${uri.host}${uri.pathname}`;
  } catch {
    return '<invalid-uri-redacted>';
  }
}

export function configFor(role, env = process.env) {
  const upper = role.toUpperCase();
  const uri = required(env[`MIGRATION_${upper}_MONGODB_URI`], `MIGRATION_${upper}_MONGODB_URI`);
  const database = required(env[`MIGRATION_${upper}_DB_NAME`], `MIGRATION_${upper}_DB_NAME`);
  return { uri, database, redactedUri: redactMongoUri(uri) };
}

export function assertApplyConfirmation(args) {
  if (args.apply !== true || args.confirm !== 'SITEBUILDER_DATA_IMPORT') {
    throw new Error('Import is disabled. Required: --apply --confirm SITEBUILDER_DATA_IMPORT');
  }
}

export function assertExportConfirmation(args) {
  if (args.execute !== true || args.confirm !== 'SITEBUILDER_SOURCE_EXPORT') {
    throw new Error('Export is disabled. Required: --execute --confirm SITEBUILDER_SOURCE_EXPORT');
  }
}

export function safeError(error) {
  const message = String(error?.message || error || 'unknown error');
  return message.replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, 'mongodb://<redacted>');
}
