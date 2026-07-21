#!/usr/bin/env node
// This deliberate guard is the only import behaviour shipped in phase one. The future approved
// cutover tool must be reviewed separately before it can invoke mongorestore.
import { assertApplyConfirmation, parseArgs, safeError } from './lib/core.mjs';

try {
  assertApplyConfirmation(parseArgs());
  throw new Error('Import apply is intentionally not implemented in the rehearsal package. Use import-dry-run only.');
} catch (error) {
  process.stderr.write(`Import refused: ${safeError(error)}\n`);
  process.exitCode = 1;
}
