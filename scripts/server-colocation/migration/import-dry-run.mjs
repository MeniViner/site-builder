#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { configFor, parseArgs, readJson, safeError, sha256File, writeJsonNew } from './lib/core.mjs';
import { collectInventory } from './lib/inventory.mjs';

export function evaluateImportDryRun({ manifest, sourceInventory, targetInventory, archiveSha256, targetDatabase }) {
  const blockers = [];
  if (manifest.kind !== 'sitebuilder-bson-export' || manifest.formatVersion !== 1) blockers.push('Unsupported transfer manifest.');
  if (manifest.archiveSha256 !== archiveSha256) blockers.push('Archive SHA-256 does not match transfer manifest.');
  if (manifest.sourceInventoryHash !== sourceInventory.canonicalHash) blockers.push('Source inventory hash does not match transfer manifest.');
  if (manifest.sourceDatabase === targetDatabase) blockers.push('Source and target database names must differ.');
  if (targetInventory.collections.length > 0) blockers.push('Target database is not empty; explicit separate approval is required before any import.');
  const expected = new Set(sourceInventory.collections.map((collection) => collection.name));
  const duplicates = sourceInventory.registry.filter((row) => !row.exists || !expected.has(row.physicalCollection));
  if (duplicates.length) blockers.push('Registry-to-physical collection mapping is incomplete.');
  return { ok: blockers.length === 0, blockers, expectedCollections: [...expected].sort(), sourceInventoryHash: sourceInventory.canonicalHash };
}

async function main() {
  const args = parseArgs();
  const transferDirectory = path.resolve(String(args.transfer || ''));
  const output = path.resolve(String(args.output || 'import-dry-run.json'));
  if (!transferDirectory) throw new Error('--transfer is required.');
  const config = configFor('target');
  const [manifest, sourceInventory, targetInventory] = await Promise.all([
    readJson(path.join(transferDirectory, 'transfer-manifest.json')),
    readJson(path.join(transferDirectory, 'source-inventory.json')),
    collectInventory(config),
  ]);
  const archive = path.join(transferDirectory, manifest.archive);
  await fs.access(archive);
  const result = evaluateImportDryRun({ manifest, sourceInventory, targetInventory, archiveSha256: await sha256File(archive), targetDatabase: config.database });
  await writeJsonNew(output, { ...result, targetDatabase: config.database, checkedAt: new Date().toISOString() });
  process.stdout.write(`${JSON.stringify({ ok: result.ok, output, blockers: result.blockers.length })}\n`);
  if (!result.ok) process.exitCode = 2;
}

main().catch((error) => { process.stderr.write(`Import dry-run failed: ${safeError(error)}\n`); process.exitCode = 1; });
