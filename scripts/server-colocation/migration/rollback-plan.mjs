#!/usr/bin/env node
import path from 'node:path';
import { configFor, parseArgs, safeError, writeJsonNew } from './lib/core.mjs';

async function main() {
  const args = parseArgs();
  const output = path.resolve(String(args.output || 'rollback-plan.json'));
  const source = configFor('source');
  const target = configFor('target');
  const plan = {
    formatVersion: 1,
    kind: 'rollback-plan-only',
    generatedAt: new Date().toISOString(),
    sourceDatabase: source.database,
    targetDatabase: target.database,
    allowedActions: [
      'stop target Builder writes',
      'preserve target inventory and logs as evidence',
      'restore Builder configuration to the source endpoint under approved change control',
    ],
    prohibitedActions: [
      'delete target database',
      'rename or quarantine target collections',
      'modify sitebuilder_hub',
      'run a rollback automatically',
    ],
    requiredSeparateApproval: 'Any target deletion requires an independent explicit approval.',
  };
  await writeJsonNew(output, plan);
  process.stdout.write(`${JSON.stringify({ ok: true, output, mode: plan.kind })}\n`);
}

main().catch((error) => { process.stderr.write(`Rollback plan failed: ${safeError(error)}\n`); process.exitCode = 1; });
