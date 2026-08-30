import { assertServerConfig, getServerConfig } from '../src/config/env.js';
import { execFileSync } from 'node:child_process';
import { createMongoDb } from '../src/db/mongo.js';
import { createBuilderIndexInspectionAdapter } from '../src/db/indexInspection.js';
import { applyBuilderIndexMigration, BUILDER_INDEX_MIGRATION_CONFIRMATION, BUILDER_INDEX_MIGRATION_VERSION, planBuilderIndexMigration } from '../src/db/indexMigration.js';
import { safeMongoError, sanitizeMongoTarget } from '../src/db/mongoTarget.js';

const config = assertServerConfig(getServerConfig());
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const confirmationIndex = args.indexOf('--confirm');
const confirmation = confirmationIndex >= 0 ? args[confirmationIndex + 1] || '' : '';
const json = args.includes('--json');
const target = sanitizeMongoTarget(config.mongodbUri, config.mongodbDbName);
const repositoryCommit = () => {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return 'unknown'; }
};

async function main() {
  if (apply && confirmation !== BUILDER_INDEX_MIGRATION_CONFIRMATION) {
    throw new Error(`Apply requires --confirm ${BUILDER_INDEX_MIGRATION_CONFIRMATION}`);
  }
  const { client, db } = await createMongoDb(config);
  try {
    const readAdapter = await createBuilderIndexInspectionAdapter(db);
    const adapter = {
      ...readAdapter,
      createIndex: (collection, key, options) => db.collection(collection).createIndex(key, options),
    };
    const plan = await planBuilderIndexMigration(adapter);
    const base = {
      commandVersion: BUILDER_INDEX_MIGRATION_VERSION,
      repositoryCommit: process.env.GIT_COMMIT || repositoryCommit(),
      timestamp: new Date().toISOString(),
      mode: apply ? 'apply' : 'dry-run', target, database: target.database,
      plannedActions: plan.plannedActions.map(({ type, collection, key }) => ({ type, collection, key })),
      existingIndexes: plan.inspection.existingIndexes,
      knownPhysicalCollections: plan.inspection.physical,
      missingIndexes: plan.inspection.missing,
      mismatchedIndexes: plan.inspection.mismatched,
      completedActions: [], skippedActions: [], blockers: plan.blockers, warnings: plan.warnings,
      status: plan.blockers.length ? 'blocked' : plan.plannedActions.length ? 'planned' : 'already-current',
    };
    const result = apply ? { ...base, ...(await applyBuilderIndexMigration(adapter, confirmation)) } : base;
    console.log(json ? JSON.stringify(result, null, 2) : [
      `Builder index migration (${result.mode})`, `database: ${result.database}`, `status: ${result.status}`,
      `planned actions: ${result.plannedActions.length}`, `blockers: ${result.blockers.length}`, `warnings: ${result.warnings.length}`,
      `known physical collections: ${result.knownPhysicalCollections.length}`,
    ].join('\n'));
    process.exitCode = result.blockers.length ? 20 : 0;
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  const actionable = error instanceof Error && (error.message.startsWith('Apply requires') || error.message.startsWith('Cannot apply'));
  console.error(JSON.stringify({ status: 'failed', target, error: actionable ? { name: error.name, message: error.message } : safeMongoError(error, target.database) }));
  process.exitCode = error instanceof Error && error.message.startsWith('Apply requires') ? 30 : 40;
});
