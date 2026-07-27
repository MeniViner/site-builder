#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const WRONG_HUB_ENV_MESSAGE =
  'The wrong HUB .env was supplied. Use the Builder Data API configuration; no secret values were printed.';

function databaseNameFromMongoUri(uri) {
  const value = String(uri || '').trim();
  if (!value) return '';

  const withoutScheme = value.replace(/^mongodb(?:\+srv)?:\/\//iu, '');
  const pathStart = withoutScheme.indexOf('/');
  if (pathStart < 0) return '';

  const rawDatabase = withoutScheme
    .slice(pathStart + 1)
    .split(/[/?#]/u, 1)[0];

  try {
    return decodeURIComponent(rawDatabase);
  } catch {
    return rawDatabase;
  }
}

export function builderSmokeEnvironmentErrors(env) {
  const errors = [];
  const mongodbUri = String(env.MONGODB_URI || '').trim();

  if (!mongodbUri && String(env.MONGO_URI || '').trim()) {
    errors.push('MONGO_URI is a HUB variable, while the Builder-required MONGODB_URI is missing.');
  }

  const configuredDatabase = String(env.MONGODB_DB_NAME || '').trim();
  const uriDatabase = databaseNameFromMongoUri(mongodbUri);
  if (
    configuredDatabase.toLowerCase() === 'sitebuilder_hub'
    || uriDatabase.toLowerCase() === 'sitebuilder_hub'
  ) {
    errors.push('The HUB database sitebuilder_hub is not valid for the Builder Data API.');
  }

  if (String(env.SERVER_PORT || '').trim() === '4100') {
    errors.push('SERVER_PORT 4100 belongs to the HUB, not the Builder Data API.');
  }

  return errors;
}

export function formatBuilderSmokeEnvironmentError(errors) {
  return [
    '[builder-smoke] Refusing to start.',
    ...errors.map((error) => `[builder-smoke] ${error}`),
    `[builder-smoke] ${WRONG_HUB_ENV_MESSAGE}`,
  ].join('\n');
}

async function main() {
  dotenv.config({ quiet: true });
  const errors = builderSmokeEnvironmentErrors(process.env);
  if (errors.length > 0) {
    process.stderr.write(`${formatBuilderSmokeEnvironmentError(errors)}\n`);
    process.exitCode = 2;
    return;
  }

  process.stdout.write('[builder-smoke] Builder environment preflight passed.\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  await main();
}
