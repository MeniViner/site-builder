import { pathToFileURL } from 'node:url';
import { assertServerConfig, getServerConfig } from './src/config/env.js';
import { assertBuilderDataPlaneReady, createMongoDb, inspectBuilderDataPlane } from './src/db/mongo.js';
import {
  assertBuilderIndexStartupPolicy,
  createBuilderIndexInspectionAdapter,
  inspectBuilderIndexes,
} from './src/db/indexInspection.js';
import { getMongoTopology, safeMongoError, sanitizeMongoTarget } from './src/db/mongoTarget.js';
import { SiteDataRepository } from './src/repository/SiteDataRepository.js';
import { LegacyCompatibilityRepository } from './src/repository/LegacyCompatibilityRepository.js';
import { createApp } from './src/app.js';
import { getListenTarget, installGracefulShutdown, safeStartupErrorCode } from './src/runtime/serverRuntime.js';

export async function startServer(runtimeConfig = assertServerConfig(getServerConfig()), dependencies = {}) {
  const connect = dependencies.createMongoDb || createMongoDb;
  const inspectIndexes = dependencies.inspectBuilderIndexes || inspectBuilderIndexes;
  const createInspectionAdapter = dependencies.createBuilderIndexInspectionAdapter || createBuilderIndexInspectionAdapter;
  const assertDataPlane = dependencies.assertBuilderDataPlaneReady || assertBuilderDataPlaneReady;
  const inspectDataPlane = dependencies.inspectBuilderDataPlane || inspectBuilderDataPlane;
  const appFactory = dependencies.createApp || createApp;
  const resolveListenTarget = dependencies.getListenTarget || getListenTarget;
  const installShutdown = dependencies.installGracefulShutdown || installGracefulShutdown;
  const target = sanitizeMongoTarget(runtimeConfig.mongodbUri, runtimeConfig.mongodbDbName);
  const { client, db } = await connect(runtimeConfig);
  let indexValidation;

  try {
    indexValidation = await inspectIndexes(await createInspectionAdapter(db));
    assertBuilderIndexStartupPolicy(indexValidation, runtimeConfig.nodeEnv);
    if (typeof runtimeConfig.requireStartupCollections === 'boolean') {
      await assertDataPlane(db, { requireCollections: runtimeConfig.requireStartupCollections });
    }
  } catch (error) {
    try {
      await client.close();
    } catch (closeError) {
      console.error(`[site-builder-api] failed to close Mongo after startup error (${safeStartupErrorCode(closeError)})`);
    }
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
  const app = appFactory({
    repository,
    legacyRepository,
    config: runtimeConfig,
    readinessCheck: () => inspectDataPlane(db),
  });
  const listenTarget = resolveListenTarget(runtimeConfig);
  const onListening = () => {
    const mode = typeof listenTarget === 'string' ? 'iisnode pipe' : 'configured port';
    console.log(`[site-builder-api] listening (${mode})`);
  };
  const server = typeof listenTarget === 'string' || !runtimeConfig.serverHost
    ? app.listen(listenTarget, onListening)
    : app.listen(listenTarget, runtimeConfig.serverHost, onListening);

  installShutdown({
    server,
    closeMongo: () => client.close(),
    timeoutMs: runtimeConfig.shutdownTimeoutMs || 30000,
  });
  return { server, client, indexValidation };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = assertServerConfig(getServerConfig());
  startServer(config).catch((error) => {
    const safeError = safeMongoError(error, config.mongodbDbName);
    console.error(`[site-builder-api] failed to start (${safeStartupErrorCode(error)}): ${safeError.message}`);
    process.exit(1);
  });
}
