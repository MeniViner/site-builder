#!/usr/bin/env node
/** Static offline clean-room verifier. It never starts a package installer. */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const MAC_MAGIC = new Set(['cffaedfe', 'cefaedfe', 'feedfacf', 'feedface', 'cafebabe', 'bebafeca']);
const run = (command, args, options = {}) => new Promise((resolve, reject) => execFile(command, args, options, (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve({ stdout, stderr })));
const sha256 = async (file) => createHash('sha256').update(await fs.readFile(file)).digest('hex');

async function files(root) {
  const answer = [];
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full); else if (entry.isFile()) answer.push(full);
    }
  }
  await walk(root); return answer;
}

async function verifyManifest(root) {
  const manifest = await fs.readFile(path.join(root, 'MANIFEST-SHA256.txt'), 'utf8');
  for (const line of manifest.trim().split('\n').filter(Boolean)) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match) throw new Error(`Malformed manifest line in ${root}`);
    if (await sha256(path.join(root, match[2])) !== match[1]) throw new Error(`Internal checksum mismatch: ${match[2]}`);
  }
}

async function main() {
  const artifacts = path.resolve(process.argv[2] || '');
  if (!process.argv[2]) throw new Error('Usage: verify-clean-room.mjs <artifacts-directory>');
  const expected = ['sitebuilder-data-api-windows.zip', 'sitebuilder-mongo-transfer-tools-windows.zip', 'sitebuilder-server-colocation-complete-kit.zip'];
  const checksumLines = await fs.readFile(path.join(artifacts, 'SHA256SUMS.txt'), 'utf8');
  for (const name of expected) {
    const entry = checksumLines.split('\n').find((line) => line.endsWith(`  ${name}`));
    if (!entry || (await sha256(path.join(artifacts, name))) !== entry.slice(0, 64)) throw new Error(`External checksum mismatch: ${name}`);
  }
  const cleanRoom = await fs.mkdtemp(path.join(os.tmpdir(), 'sitebuilder clean room '));
  try {
    for (const name of expected) await run('/usr/bin/unzip', ['-q', path.join(artifacts, name), '-d', cleanRoom]);
    const roots = await fs.readdir(cleanRoom, { withFileTypes: true });
    for (const entry of roots.filter((item) => item.isDirectory())) await verifyManifest(path.join(cleanRoom, entry.name));
    for (const file of await files(cleanRoom)) {
      const rel = path.relative(cleanRoom, file).replaceAll(path.sep, '/').toLowerCase();
      const base = path.basename(rel);
      if (base.startsWith('.env') || /\.(bson|archive|dump|pem|key)$/i.test(base) || base === 'package-lock.json' || (base.endsWith('.ts') && !base.endsWith('.d.ts'))) throw new Error(`Forbidden clean-room package path: ${rel}`);
      if (/\.(dylib|node|so|a|o)$/.test(rel)) throw new Error(`Non-Windows native artifact: ${rel}`);
      if (MAC_MAGIC.has((await fs.readFile(file)).subarray(0, 4).toString('hex'))) throw new Error(`Mach-O artifact: ${rel}`);
    }
    const dataRoot = path.join(cleanRoom, 'sitebuilder-data-api-windows');
    const mongoRoot = path.join(cleanRoom, 'sitebuilder-mongo-transfer-tools-windows');
    for (const required of [
      path.join(dataRoot, 'runtime', 'node.exe'),
      path.join(dataRoot, 'app', 'node_modules', 'express', 'package.json'),
      path.join(dataRoot, 'app', 'node_modules', 'mongodb', 'package.json'),
      path.join(dataRoot, 'app', 'node_modules', 'bson', 'package.json'),
      path.join(dataRoot, 'app', 'validate-builder-smoke-env.mjs'),
      path.join(mongoRoot, 'bin', 'mongorestore.exe'),
      path.join(mongoRoot, 'runtime', 'node.exe'),
    ]) await fs.access(required);

    const bsonInstallations = (await files(path.join(dataRoot, 'app', 'node_modules')))
      .filter((file) => path.basename(file) === 'package.json' && path.basename(path.dirname(file)) === 'bson');
    if (bsonInstallations.length !== 1) throw new Error(`Expected one packaged bson installation, found ${bsonInstallations.length}`);

    const contents = JSON.parse(await fs.readFile(path.join(dataRoot, 'PACKAGE-CONTENTS.json'), 'utf8'));
    if (
      contents.dependencyLock?.mongodbVersion !== '7.2.0'
      || contents.dependencyLock?.bsonVersion !== '7.2.0'
      || contents.dependencyLock?.bsonRequirement !== '^7.2.0'
    ) {
      throw new Error('Builder dependency metadata does not contain the locked mongodb/bson pair.');
    }

    const configuration = await fs.readFile(path.join(dataRoot, 'CONFIGURATION.env.example'), 'utf8');
    for (const requiredLine of [
      'NODE_ENV=production',
      'SERVER_PORT=3001',
      'MONGODB_URI=mongodb://127.0.0.1:27018/sitebuilder_site_data',
      'MONGODB_DB_NAME=sitebuilder_site_data',
      'ADMIN_API_KEY=<required-builder-admin-api-key>',
    ]) {
      if (!configuration.split(/\r?\n/u).includes(requiredLine)) {
        throw new Error(`Builder configuration is missing: ${requiredLine}`);
      }
    }
    const configurationKeys = configuration
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => line.split('=', 1)[0]);
    const forbiddenHubKey = configurationKeys.find((key) => (
      key === 'MONGO_URI'
      || key === 'AUTH_ENABLED'
      || /JOB|SCHEDUL|APPROVAL|^HUB_DANGEROUS_|SHAREPOINT.*COOKIE/iu.test(key)
    ));
    if (forbiddenHubKey) throw new Error(`Forbidden HUB configuration key: ${forbiddenHubKey}`);

    const startCommand = await fs.readFile(path.join(dataRoot, 'START-LOCAL-SMOKE.cmd'), 'utf8');
    for (const guard of ['MONGO_URI', 'sitebuilder_hub', 'SERVER_PORT 4100', 'validate-builder-smoke-env.mjs']) {
      if (!startCommand.includes(guard)) throw new Error(`Builder smoke command is missing guard: ${guard}`);
    }

    process.stdout.write(JSON.stringify({
      ok: true,
      cleanRoom,
      checks: [
        'extract outside repository',
        'checksums',
        'path containing spaces',
        'offline payload',
        'locked mongodb/bson payload',
        'Builder-only configuration',
        'HUB environment guards',
        'no npm install on server',
        'no TypeScript build',
        'Windows-only binaries',
        'no secrets or production data',
      ],
    }) + '\n');
  } finally { await fs.rm(cleanRoom, { recursive: true, force: true }); }
}
main().catch((error) => { process.stderr.write(`Clean-room verification failed: ${error.message}\n`); process.exitCode = 1; });
