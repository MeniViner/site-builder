#!/usr/bin/env node
import path from 'node:path';
import { parseArgs, readJson, safeError, writeJsonNew } from './lib/core.mjs';
import { normalizeMappingManifest, validateMappingManifest } from './lib/mapping.mjs';

async function main() {
  const args = parseArgs();
  if (!args.input) throw new Error('--input mapping JSON is required.');
  const manifest = await readJson(path.resolve(String(args.input)));
  const errors = validateMappingManifest(manifest);
  const result = { ok: errors.length === 0, errors, manifest: errors.length ? undefined : normalizeMappingManifest(manifest) };
  if (args.output) await writeJsonNew(path.resolve(String(args.output)), result);
  process.stdout.write(`${JSON.stringify({ ok: result.ok, errors: errors.length, canonicalHash: result.manifest?.canonicalHash ?? null })}\n`);
  if (!result.ok) process.exitCode = 2;
}

main().catch((error) => { process.stderr.write(`Mapping validation failed: ${safeError(error)}\n`); process.exitCode = 1; });
