#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { parseCliArgs, resolveConfig } from '../sp-env.js';
import {
  installHelperFiles,
  resolveHelperInstallPlan,
} from './installExportHelperCore.mjs';

async function readSitesConfig(filePath) {
  if (!filePath) return [];
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const parsed = JSON.parse(await fs.readFile(resolvedPath, 'utf8'));
  if (!Array.isArray(parsed.sites)) {
    throw new Error(`Sites config must contain a "sites" array: ${resolvedPath}`);
  }
  return parsed.sites;
}

function printResult({ plan, result, dryRun }) {
  console.log(JSON.stringify({
    ok: true,
    dryRun,
    siteCode: plan.siteCode,
    helperFolder: plan.helperFolderRel,
    helperUrl: plan.helperUrl,
    files: result.writes.map((write) => ({
      serverRelativePath: write.serverRelativePath,
      webDavPath: write.webDavPath,
      contentType: write.contentType,
    })),
    nextStep: `Open ${plan.helperUrl}`,
  }, null, 2));
}

async function installOne({ cli, envPath, dryRun }) {
  const config = resolveConfig({ envFilePath: envPath, cli });
  const plan = resolveHelperInstallPlan({ config, cli });
  const result = installHelperFiles({ plan, config, dryRun });
  printResult({ plan, result, dryRun });
  return { plan, result };
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  const dryRun = cli['dry-run'] === true || String(cli['dry-run'] || '').toLowerCase() === 'true';
  const envPath = cli.env ? path.resolve(process.cwd(), String(cli.env)) : path.resolve(process.cwd(), '.env.production');

  if (cli['all-sites'] === true || cli.allSites === true) {
    const sites = await readSitesConfig(cli['sites-config'] || cli.config);
    if (sites.length === 0) {
      throw new Error('--all-sites requires --sites-config <json> with a non-empty sites array.');
    }
    for (const site of sites) {
      await installOne({
        cli: {
          ...cli,
          ...site,
          site: site.site || site.siteCode || site['site-code'],
          'site-relative-path': site.siteRelativePath || site['site-relative-path'],
        },
        envPath,
        dryRun,
      });
    }
    return;
  }

  await installOne({ cli, envPath, dryRun });
}

main().catch((error) => {
  console.error(`[sharepoint-install-export-helper] ${error.message}`);
  process.exit(1);
});
