#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import {
  DEFAULT_MANUAL_INPUT_DIR,
  DEFAULT_OUTPUT_ROOT,
  createClosedSharePointBatchExportArtifact,
  createClosedSharePointExportArtifact,
} from './exportKitCore.mjs';
import { parseCliArgs } from '../sp-env.js';

async function loadConfig(configPath) {
  if (!configPath) return {};
  const resolved = path.resolve(process.cwd(), configPath);
  return JSON.parse(await fs.readFile(resolved, 'utf8'));
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  const config = await loadConfig(cli.config);
  const inputDir = path.resolve(process.cwd(), String(cli.input || config.inputDirectory || DEFAULT_MANUAL_INPUT_DIR));
  const browserExportPath = cli['browser-export']
    ? path.resolve(process.cwd(), String(cli['browser-export']))
    : '';
  const outputRoot = path.resolve(process.cwd(), String(cli.output || config.outputDirectory || DEFAULT_OUTPUT_ROOT));
  const siteCode = String(cli.site || cli.siteCode || config.siteCode || '').trim();
  const isBatch = cli.batch === true || cli['all-sites'] === true || cli.allSites === true;

  if (isBatch && browserExportPath) {
    throw new Error('Batch validation supports manual site folders only. Validate browser helper exports one site at a time.');
  }

  if (isBatch) {
    const result = await createClosedSharePointBatchExportArtifact({
      inputDir,
      outputRoot,
      config,
      sourceMode: 'manual-folder',
    });

    console.log(JSON.stringify({
      ok: result.manifest.safeForMongoDryRun,
      batch: true,
      exportDir: result.exportDir,
      totalSites: result.manifest.totalSites,
      status: result.manifest.status,
      warnings: result.manifest.warnings.length,
      errors: result.manifest.errors.length,
      collectionCollisionCheck: result.manifest.collectionCollisionCheck,
      nextCommand: `npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export ${result.exportDir} --all-sites`,
    }, null, 2));

    if (!result.manifest.safeForMongoDryRun) {
      process.exitCode = 1;
    }
    return;
  }

  const result = await createClosedSharePointExportArtifact({
    inputDir,
    browserExportPath,
    outputRoot,
    config: {
      ...config,
      ...(siteCode ? { siteCode } : {}),
    },
    sourceMode: browserExportPath ? 'browser-helper' : 'manual-folder',
  });

  console.log(JSON.stringify({
    ok: result.manifest.safeForMongoDryRun,
    exportDir: result.exportDir,
    siteCode: result.manifest.siteCode,
    sourceMode: result.manifest.sourceMode,
    warnings: result.manifest.warnings.length,
    errors: result.manifest.errors.length,
    nextCommand: `npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export ${result.exportDir} --site ${result.manifest.siteCode}`,
  }, null, 2));

  if (!result.manifest.safeForMongoDryRun) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[sharepoint-closed-validate] failed:', error?.message || error);
  process.exit(1);
});
