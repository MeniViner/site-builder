#!/usr/bin/env node
import path from 'node:path';
import { parseArgs, readJson, safeError, writeJsonNew } from './lib/core.mjs';
import { compareInventories } from './lib/inventory.mjs';

async function main() {
  const args = parseArgs();
  const sourcePath = path.resolve(String(args.source || ''));
  const targetPath = path.resolve(String(args.target || ''));
  if (!args.source || !args.target) throw new Error('--source and --target inventory JSON files are required.');
  const differences = compareInventories(await readJson(sourcePath), await readJson(targetPath));
  const result = { ok: differences.length === 0, comparedAt: new Date().toISOString(), differences };
  if (args.output) await writeJsonNew(path.resolve(String(args.output)), result);
  process.stdout.write(`${JSON.stringify({ ok: result.ok, differences: differences.length })}\n`);
  if (!result.ok) process.exitCode = 2;
}

main().catch((error) => { process.stderr.write(`Verification failed: ${safeError(error)}\n`); process.exitCode = 1; });
