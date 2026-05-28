#!/usr/bin/env node
import { MongoClient } from 'mongodb';
import {
  LOCAL_MONGO,
  assertSafeLocalMongoTarget,
  loadEnvFile,
  requireResetConfirmation,
} from './localMongoUtils.mjs';

async function dropLocalDb({ label, uri, dbName }) {
  assertSafeLocalMongoTarget({ uri, dbName });
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    await client.db(dbName).dropDatabase();
    console.log(`PASS: dropped ${label} database "${dbName}"`);
  } finally {
    await client.close().catch(() => {});
  }
}

async function main() {
  requireResetConfirmation(process.argv.slice(2));

  const [devEnv, testEnv] = await Promise.all([
    loadEnvFile(LOCAL_MONGO.serverDevEnvPath),
    loadEnvFile(LOCAL_MONGO.serverTestEnvPath),
  ]);
  if (!devEnv.exists) throw new Error(`Missing ${LOCAL_MONGO.serverDevEnvPath}`);
  if (!testEnv.exists) throw new Error(`Missing ${LOCAL_MONGO.serverTestEnvPath}`);

  await dropLocalDb({
    label: 'dev',
    uri: devEnv.values.MONGODB_URI,
    dbName: devEnv.values.MONGODB_DB_NAME,
  });
  await dropLocalDb({
    label: 'test',
    uri: testEnv.values.MONGODB_URI,
    dbName: testEnv.values.MONGODB_DB_NAME,
  });
}

main().catch((error) => {
  console.error(`[dev:mongo:reset] ${error.message}`);
  process.exit(1);
});
