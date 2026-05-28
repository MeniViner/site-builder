import { MongoClient } from 'mongodb';

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
  await client.connect();
  return {
    client,
    db: client.db(mongodbDbName),
  };
}
