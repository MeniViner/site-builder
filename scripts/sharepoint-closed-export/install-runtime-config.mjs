#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { parseCliArgs, resolveConfig } from '../sp-env.js';
import {
  assertSafeRuntimeConfigPlan,
  installRuntimeConfig,
  resolveRuntimeConfigPlan,
} from './installRuntimeConfigCore.mjs';

function printResult({ plan, result, dryRun }) {
  console.log(JSON.stringify({
    ok: true,
    dryRun,
    action: 'install-runtime-config',
    siteCode: plan.siteId,
    runtimeConfigFile: path.basename(plan.runtimeConfigRel),
    runtimeConfigUrl: plan.runtimeConfigUrl,
    serverRelativePath: plan.runtimeConfigRel,
    webDavPath: plan.distRel,
    files: result.writes.map((write) => ({
      serverRelativePath: write.serverRelativePath,
      webDavPath: write.webDavPath,
      contentType: write.contentType,
    })),
    nextStep: `Open SharePoint page: ${plan.runtimeConfigUrl}`,
  }, null, 2));
}

function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  const dryRun = cli['dry-run'] === true || String(cli['dry-run'] || '').toLowerCase() === 'true';
  const envPath = cli.env ? path.resolve(process.cwd(), String(cli.env)) : path.resolve(process.cwd(), '.env.production');
  const config = resolveConfig({ envFilePath: envPath, cli });
  const plan = resolveRuntimeConfigPlan({ config, cli });

  assertSafeRuntimeConfigPlan(plan);

  const result = installRuntimeConfig({ plan, config, dryRun, fsAdapter: fs });
  printResult({ plan, result, dryRun });
}

main().catch((error) => {
  console.error(`[sharepoint-install-runtime-config] ${error.message}`);
  process.exit(1);
});
