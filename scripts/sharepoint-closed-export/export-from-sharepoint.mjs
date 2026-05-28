#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import {
  DEFAULT_OUTPUT_ROOT,
  buildLegacyFilePlan,
  createClosedSharePointExportArtifact,
  pathToMountedFile,
} from './exportKitCore.mjs';
import { parseCliArgs } from '../sp-env.js';

async function loadConfig(configPath) {
  if (!configPath) {
    throw new Error('Missing --config. Use scripts/sharepoint-closed-export/export.config.example.json as a template.');
  }
  const resolved = path.resolve(process.cwd(), configPath);
  return JSON.parse(await fs.readFile(resolved, 'utf8'));
}

async function copyFromMountedSharePoint({ config, tempInputDir }) {
  const mountedRootPath = String(config.mountedRootPath || config.webDavRootPath || '').trim();
  if (!mountedRootPath) {
    throw new Error(
      'Terminal export requires config.mountedRootPath or config.webDavRootPath pointing to a locally mounted SharePoint/WebDAV filesystem. Use manual-folder mode if browser-only auth is required.',
    );
  }

  await fs.mkdir(tempInputDir, { recursive: true });
  const plan = buildLegacyFilePlan(config);
  const copied = [];

  for (const file of plan) {
    const sourcePath = pathToMountedFile(mountedRootPath, file.serverRelativePath);
    const text = await fs.readFile(sourcePath, 'utf8');
    if (!text.trim()) {
      throw new Error(`Empty read from mounted SharePoint path: ${sourcePath}`);
    }
    await fs.writeFile(path.join(tempInputDir, file.fileName), text, 'utf8');
    copied.push({ fileName: file.fileName, sourcePath });
  }

  return copied;
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  const config = await loadConfig(cli.config);
  const mode = String(cli.mode || config.mode || 'terminal').trim();

  if (mode !== 'terminal') {
    throw new Error(`export-from-sharepoint only supports mode "terminal"; received "${mode}". Use validate-manual-export for manual-folder/browser-helper modes.`);
  }

  const outputRoot = path.resolve(process.cwd(), String(cli.output || config.outputDirectory || DEFAULT_OUTPUT_ROOT));
  const tempInputDir = path.resolve(
    process.cwd(),
    '.tmp',
    'sharepoint-closed-export',
    `terminal-${Date.now()}`,
  );

  try {
    const copied = await copyFromMountedSharePoint({ config, tempInputDir });
    const result = await createClosedSharePointExportArtifact({
      inputDir: tempInputDir,
      outputRoot,
      config,
      sourceMode: 'terminal',
    });

    console.log(JSON.stringify({
      ok: result.manifest.safeForMongoDryRun,
      exportDir: result.exportDir,
      copied,
      warnings: result.manifest.warnings.length,
      errors: result.manifest.errors.length,
      nextCommand: `npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export ${result.exportDir} --site ${result.manifest.siteCode}`,
    }, null, 2));

    if (!result.manifest.safeForMongoDryRun) {
      process.exitCode = 1;
    }
  } finally {
    await fs.rm(tempInputDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[sharepoint-closed-export] failed:', error?.message || error);
  process.exit(1);
});
