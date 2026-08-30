import { assertServerConfig, getServerConfig } from './src/config/env.js';
import { pathToFileURL } from 'node:url';
import { createMongoDb } from './src/db/mongo.js';
import { createBuilderIndexInspectionAdapter, inspectBuilderIndexes, assertBuilderIndexStartupPolicy } from './src/db/indexInspection.js';
import { getMongoTopology, safeMongoError, sanitizeMongoTarget } from './src/db/mongoTarget.js';
import { SiteDataRepository } from './src/repository/SiteDataRepository.js';
import { LegacyCompatibilityRepository } from './src/repository/LegacyCompatibilityRepository.js';
import { createApp } from './src/app.js';

export async function startServer(runtimeConfig = assertServerConfig(getServerConfig()), dependencies = {}) {
  const connect = dependencies.createMongoDb || createMongoDb;
  const inspect = dependencies.inspectBuilderIndexes || inspectBuilderIndexes;
  const createAdapter = dependencies.createBuilderIndexInspectionAdapter || createBuilderIndexInspectionAdapter;
  const target = sanitizeMongoTarget(runtimeConfig.mongodbUri, runtimeConfig.mongodbDbName);
  const { client, db } = await connect(runtimeConfig);
  let indexValidation;
  try {
    indexValidation = await inspect(await createAdapter(db));
    assertBuilderIndexStartupPolicy(indexValidation, runtimeConfig.nodeEnv);
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
  console.log('[site-builder-api] Mongo connected and inspected', {
    target,
    connectionStatus: 'connected',
    topology: getMongoTopology(client),
    indexValidation,
  });
  const repository = new SiteDataRepository(db, {
    collectionPrefix: runtimeConfig.siteCollectionPrefix,
  });

  const legacyRepository = new LegacyCompatibilityRepository(repository);
  const app = (dependencies.createApp || createApp)({ repository, legacyRepository, config: runtimeConfig });

  const server = app.listen(runtimeConfig.serverPort, runtimeConfig.serverHost, () => {
    console.log(`[site-builder-api] listening on http://${runtimeConfig.serverHost}:${runtimeConfig.serverPort}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await client.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return { server, client, indexValidation };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = assertServerConfig(getServerConfig());
  startServer().catch((error) => {
    console.error('[site-builder-api] failed to start', safeMongoError(error, config.mongodbDbName));
    process.exit(1);
  });
}
