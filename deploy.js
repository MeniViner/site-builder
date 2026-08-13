#!/usr/bin/env node
// Compatibility entry point for the historical `node deploy.js` command.
import { reportLegacyDeployError, runLegacyDeploy } from './scripts/deploy-legacy.mjs';

try {
  await runLegacyDeploy();
} catch (error) {
  reportLegacyDeployError(error);
  process.exit(1);
}
