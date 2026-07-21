#!/usr/bin/env node
import path from 'node:path';
import { configFor, parseArgs, safeError, writeJsonNew } from './lib/core.mjs';
import { collectInventory } from './lib/inventory.mjs';

async function main() {
  const args = parseArgs();
  const role = args.role === 'target' ? 'target' : 'source';
  const output = path.resolve(String(args.output || `inventory-${role}.json`));
  const config = configFor(role);
  const inventory = await collectInventory(config);
  await writeJsonNew(output, inventory);
  process.stdout.write(`${JSON.stringify({ ok: true, role, database: config.database, output, canonicalHash: inventory.canonicalHash })}\n`);
}

main().catch((error) => { process.stderr.write(`Inventory failed: ${safeError(error)}\n`); process.exitCode = 1; });
