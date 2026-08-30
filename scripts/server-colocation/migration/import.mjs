#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertApplyConfirmation, configFor, parseArgs, readJson, safeError, sha256File, writeJsonNew } from './lib/core.mjs';
import { collectInventory } from './lib/inventory.mjs';
import { evaluateImportDryRun } from './import-dry-run.mjs';

const run = (binary, args) => new Promise((resolve, reject) => {
  const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); let error = '';
  child.stderr.on('data', (data) => { error += String(data); }); child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(code) : reject(new Error(`mongorestore exit ${code}: ${error.slice(0, 400)}`)));
});
async function main() {
  const args = parseArgs(); assertApplyConfirmation(args);
  const transfer = path.resolve(String(args.transfer || '')); if (!args.transfer) throw new Error('--transfer is required');
  const source = configFor('source'), target = configFor('target');
  if (source.database === 'sitebuilder_hub' || target.database === 'sitebuilder_hub' || source.database === target.database || source.uri === target.uri) throw new Error('Unsafe source/target database mapping refused');
  const [manifest, sourceInventory, targetInventory] = await Promise.all([readJson(path.join(transfer, 'transfer-manifest.json')), readJson(path.join(transfer, 'source-inventory.json')), collectInventory(target)]);
  const archive = path.join(transfer, manifest.archive); const checksum = await sha256File(archive);
  const preflight = evaluateImportDryRun({ manifest, sourceInventory, targetInventory, archiveSha256: checksum, targetDatabase: target.database });
  if (!preflight.ok) throw new Error(preflight.blockers.join(' '));
  const tool = path.resolve(String(args['mongorestore-bin'] || process.env.MONGORESTORE_BIN || '')); await fs.access(tool);
  const help = await new Promise((resolve, reject) => { const c = spawn(tool, ['--help'], { windowsHide: true }); let out=''; c.stdout.on('data',d=>out+=d); c.on('error',reject); c.on('close',code=>code===0?resolve(out):reject(new Error('mongorestore help failed'))); });
  if (!String(help).includes('--nsFrom') || !String(help).includes('--nsTo')) throw new Error('Bundled mongorestore does not support namespace remapping');
  const startedAt = new Date().toISOString(); await run(tool, [`--host=${new URL(target.uri).hostname}`, `--port=${new URL(target.uri).port || '27017'}`, `--archive=${archive}`, '--gzip', `--nsInclude=${source.database}.*`, `--nsFrom=${source.database}.*`, `--nsTo=${target.database}.*`]);
  const restored = await collectInventory(target); const output = path.resolve(String(args.output || path.join(transfer, 'import-result.json')));
  await writeJsonNew(output, { status:'completed', startedAt, completedAt:new Date().toISOString(), sourceDatabase:source.database, targetDatabase:target.database, sourceArchiveSha256:checksum, namespaceMapping:{from:`${source.database}.*`,to:`${target.database}.*`}, toolVersion:'verified-by-help', restoredCollections:restored.collections.map(c=>({name:c.name,count:c.count})) });
  process.stdout.write(JSON.stringify({ok:true,output})+'\n');
}
main().catch(e=>{process.stderr.write(`Import failed: ${safeError(e)}\n`);process.exitCode=1;});
