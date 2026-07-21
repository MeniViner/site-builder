#!/usr/bin/env node
import { parseArgs, safeError } from './lib/core.mjs';

const REQUIRED_FALSE = ['HUB_DANGEROUS_ALLOW_SITE_DATA_WRITES', 'HUB_DANGEROUS_BYPASS_AUTH', 'HUB_DANGEROUS_BYPASS_SITE_SCOPE'];
const REQUIRED_PRESENT = ['MIGRATION_SOURCE_MONGODB_URI', 'MIGRATION_TARGET_MONGODB_URI', 'MIGRATION_SOURCE_DB_NAME', 'MIGRATION_TARGET_DB_NAME'];

export function findPrecutoverBlockers(env) {
  const blockers = [];
  for (const key of REQUIRED_FALSE) if (String(env[key] || '').toLowerCase() !== 'false') blockers.push(`${key} must be explicitly false.`);
  for (const key of REQUIRED_PRESENT) if (!String(env[key] || '').trim()) blockers.push(`${key} is missing.`);
  if (env.MIGRATION_SOURCE_DB_NAME === env.MIGRATION_TARGET_DB_NAME) blockers.push('Source and target database names must differ.');
  if (String(env.BUILDER_API_BIND_ADDRESS || '').trim() && !['127.0.0.1', '::1', 'localhost'].includes(String(env.BUILDER_API_BIND_ADDRESS).trim())) blockers.push('BUILDER_API_BIND_ADDRESS must be localhost/internal.');
  if (String(env.BUILDER_API_KEY || '').trim() && String(env.VITE_BUILDER_API_KEY || '').trim()) blockers.push('Builder API key is present in browser runtime configuration.');
  return blockers;
}

try {
  const args = parseArgs();
  if (args.help) {
    process.stdout.write('Checks environment only; never prints values. Exit 2 means a pre-cutover blocker remains.\n');
  } else {
    const blockers = findPrecutoverBlockers(process.env);
    process.stdout.write(`${JSON.stringify({ ok: blockers.length === 0, blockers })}\n`);
    if (blockers.length) process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`Pre-cutover blocker check failed: ${safeError(error)}\n`);
  process.exitCode = 1;
}
