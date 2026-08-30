import { MongoClient } from 'mongodb';
import { safeMongoError } from './mongoTarget.js';

export const SAFE_WRITE_CONCERN = Object.freeze({ w: 'majority', j: true });

export async function createMongoDb({ mongodbUri, mongodbDbName }) {
  if (!mongodbUri) {
    throw new Error('MONGODB_URI is required');
  }
  if (!mongodbDbName) {
    throw new Error('MONGODB_DB_NAME is required');
  }

  const client = new MongoClient(mongodbUri, {
    writeConcern: SAFE_WRITE_CONCERN,
    retryWrites: true,
  });
  try {
    await client.connect();
  } catch (error) {
    await client.close().catch(() => undefined);
    const safe = safeMongoError(error, mongodbDbName);
    throw Object.assign(new Error(safe.message), { code: safe.code });
  }
  return {
    client,
    db: client.db(mongodbDbName),
  };
}
