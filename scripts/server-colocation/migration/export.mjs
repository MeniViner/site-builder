#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertDirectoryIsNew, assertExportConfirmation, configFor, parseArgs, safeError, sha256File, writeJsonNew, TRANSFER_FORMAT_VERSION } from './lib/core.mjs';
import { collectInventory } from './lib/inventory.mjs';

function execute(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`mongodump exited with code ${code}: ${stderr.slice(0, 400)}`)));
  });
}

async function main() {
  const args = parseArgs();
  assertExportConfirmation(args);
  const destination = path.resolve(String(args.output || 'sitebuilder-source-export'));
  await assertDirectoryIsNew(destination);
  const config = configFor('source');
  const inventory = await collectInventory(config);
  const archive = path.join(destination, 'sitebuilder-source.archive.gz');
  const mongodump = String(args['mongodump-bin'] || process.env.MONGODUMP_BIN || 'mongodump');
  // The URI is passed directly to the official tool and is never included in files or console output.
  await execute(mongodump, [`--uri=${config.uri}`, `--db=${config.database}`, `--archive=${archive}`, '--gzip']);
  const manifest = {
    formatVersion: TRANSFER_FORMAT_VERSION,
    kind: 'sitebuilder-bson-export',
    sourceDatabase: config.database,
    archive: path.basename(archive),
    archiveSha256: await sha256File(archive),
    sourceInventory: 'source-inventory.json',
    sourceInventoryHash: inventory.canonicalHash,
    createdAt: new Date().toISOString(),
    tool: 'mongodump',
  };
  await writeJsonNew(path.join(destination, 'source-inventory.json'), inventory);
  await writeJsonNew(path.join(destination, 'transfer-manifest.json'), manifest);
  await fs.writeFile(path.join(destination, 'SHA256SUMS.txt'), `${manifest.archiveSha256}  ${manifest.archive}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ ok: true, output: destination, sourceDatabase: config.database, archiveSha256: manifest.archiveSha256 })}\n`);
}

main().catch((error) => { process.stderr.write(`Export failed: ${safeError(error)}\n`); process.exitCode = 1; });
