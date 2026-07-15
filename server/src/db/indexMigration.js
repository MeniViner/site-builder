import { BUILDER_GLOBAL_INDEXES, BUILDER_PHYSICAL_INDEXES, mongoIndexName } from './indexDefinitions.js';
import { inspectBuilderIndexes } from './indexInspection.js';

export const BUILDER_INDEX_MIGRATION_CONFIRMATION = 'BUILDER_INDEX_MIGRATION';
export const BUILDER_INDEX_MIGRATION_VERSION = '1';

export async function planBuilderIndexMigration(adapter) {
  const inspection = await inspectBuilderIndexes(adapter);
  const plannedActions = [];
  for (const definition of BUILDER_GLOBAL_INDEXES) {
    const target = `${definition.collection}.${mongoIndexName(definition.key)}`;
    if (inspection.missing.includes(target)) plannedActions.push({ type: 'createIndex', collection: definition.collection, ...definition });
  }
  for (const item of inspection.physical) {
    if (!item.exists) continue;
    for (const definition of BUILDER_PHYSICAL_INDEXES) {
      if (item.missingIndexes.includes(mongoIndexName(definition.key))) {
        plannedActions.push({ type: 'createIndex', collection: item.collection, ...definition });
      }
    }
  }
  return { inspection, plannedActions, blockers: inspection.mismatched.map((name) => `Cannot apply over mismatched index: ${name}`), warnings: inspection.warnings };
}

export async function applyBuilderIndexMigration(adapter, confirmation) {
  if (confirmation !== BUILDER_INDEX_MIGRATION_CONFIRMATION) {
    throw new Error(`Apply requires --confirm ${BUILDER_INDEX_MIGRATION_CONFIRMATION}`);
  }
  const plan = await planBuilderIndexMigration(adapter);
  if (plan.blockers.length) throw new Error(plan.blockers.join('; '));
  const completedActions = [];
  for (const action of plan.plannedActions) {
    await adapter.createIndex(action.collection, action.key, action.options);
    completedActions.push(`created:${action.collection}.${mongoIndexName(action.key)}`);
  }
  return { completedActions, status: completedActions.length ? 'applied' : 'already-current' };
}
