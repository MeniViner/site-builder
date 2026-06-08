#!/usr/bin/env node
import fs from 'fs';
import { MongoClient } from 'mongodb';
import { LOCAL_MONGO, isLocalMongoUri, isSafeLocalDatabaseName, parseEnvText } from './localMongoUtils.mjs';

function getMongoUriFromEnv() {
  const nativeDev = loadEnvFileSync('server/.env.local.native');
  if (nativeDev && isLocalMongoUri(nativeDev.values.MONGODB_URI) && isSafeLocalDatabaseName(nativeDev.values.MONGODB_DB_NAME)) {
    return nativeDev.values.MONGODB_URI;
  }

  const standardDev = loadEnvFileSync(LOCAL_MONGO.serverDevEnvPath);
  if (!standardDev) {
    throw new Error('Could not find server/.env.local.native or server/.env.local.');
  }

  if (!isLocalMongoUri(standardDev.values.MONGODB_URI) || !isSafeLocalDatabaseName(standardDev.values.MONGODB_DB_NAME)) {
    throw new Error('Refusing to init replica set: dev env is not a safe local MongoDB target.');
  }

  return standardDev.values.MONGODB_URI;
}

function loadEnvFileSync(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, 'utf8');
  return {
    exists: true,
    values: parseEnvText(text),
  };
}

async function main() {
  const uri = getMongoUriFromEnv();

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
  });

  try {
    await client.connect();
    const admin = client.db('admin');
    const hello = await admin.command({ hello: 1 });
    const currentSet = hello?.setName;
    if (currentSet) {
      console.log(`[native-rs0] MongoDB already initialized with replica set ${currentSet}. No action needed.`);
      return;
    }

    const result = await admin.command({
      replSetInitiate: {
        _id: LOCAL_MONGO.replicaSet,
        members: [
          {
            _id: 0,
            host: 'localhost:27017',
          },
        ],
      },
    });

    if (result?.ok === 1) {
      console.log('[native-rs0] Replica set initialized successfully (rs0).');
      return;
    }

    throw new Error(`Replica set initialize returned unexpected response: ${JSON.stringify(result)}`);
  } finally {
    await client.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`[native-rs0] ${error.message}`);
  process.exit(1);
});
