import fs from 'fs';

const ALLOWED_RUNTIME_FILE_NAMES = new Set([
  'sitebuilder-runtime-config.json',
  'runtime-config.json',
]);

function normalizeServerRelative(...parts) {
  return `/${parts.flatMap((part) => String(part || '').split('/').filter(Boolean)).join('/')}`;
}

function normalizeRuntimeConfigFileName(value, fallback) {
  const raw = String(value || '').trim().replace(/^['"`]|['"`]$/g, '');
  const candidate = raw || fallback;
  if (!candidate) {
    return fallback;
  }

  if (candidate.includes('/') || candidate.includes('\\')) {
    throw new Error('Runtime config file name must not include path separators.');
  }
  if (!ALLOWED_RUNTIME_FILE_NAMES.has(candidate)) {
    throw new Error(`Unsupported runtime config file name "${candidate}". Allowed: sitebuilder-runtime-config.json, runtime-config.json`);
  }

  return candidate;
}

export function resolveRuntimeConfigPlan({ config, cli = {} } = {}) {
  if (String(cli['api-key'] || cli.apiKey || '').trim()) {
    throw new Error('Runtime config must not contain API keys. Use server-side/session authentication.');
  }
  const rawSite = cli.site || cli['site-code'] || config?.siteCode || '';
  const storageBackend = String(cli['storage-backend'] || cli.storageBackend || config?.storageBackend || 'txt').trim();
  const backendApiUrl = String(cli['backend-url'] || cli.backendUrl || cli['api-url'] || config?.backendApiUrl || '').trim();
  const siteId = String(cli['site-id'] || cli.siteId || rawSite || '').trim();
  const filename = normalizeRuntimeConfigFileName(
    cli['runtime-config-file'] || cli.runtimeConfigFile || 'sitebuilder-runtime-config.json',
    'sitebuilder-runtime-config.json',
  );

  const distRel = normalizeServerRelative(config.distRel || '');
  const runtimeConfigRel = normalizeServerRelative(distRel, filename);
  const runtimeConfigUrl = config.host
    ? `https://${String(config.host).replace(/^https?:\/\//i, '').replace(/\/+$/, '')}${runtimeConfigRel}`
    : runtimeConfigRel;
  const sharePointSiteUrl = config.host
    ? `https://${String(config.host).replace(/^https?:\/\//i, '').replace(/\/+$/, '')}${normalizeServerRelative(config.siteRootRel || `/sites/${rawSite}`)}`
    : normalizeServerRelative(config.siteRootRel || `/sites/${rawSite}`);

  return {
    siteCode: String(rawSite).replace(/^\/+|\/+$/g, ''),
    siteId,
    storageBackend,
    backendApiUrl,
    filename,
    distRel,
    runtimeConfigRel,
    runtimeConfigUrl,
    sharePointSiteUrl,
  };
}

export function assertSafeRuntimeConfigPlan(plan) {
  if (!plan?.runtimeConfigRel || !plan.runtimeConfigRel.startsWith('/')) {
    throw new Error('Invalid runtime config plan: missing runtimeConfigRel');
  }
  if (!['txt', 'mongo'].includes(plan.storageBackend)) {
    throw new Error(`Unsupported storageBackend ${plan.storageBackend}. Expected txt or mongo.`);
  }
  if (plan.storageBackend === 'mongo' && !plan.backendApiUrl) {
    throw new Error('backendApiUrl is required for runtime config.');
  }
  if (!plan.siteId) {
    throw new Error('siteId is required for runtime config.');
  }
  if (typeof plan.runtimeConfigRel !== 'string') {
    throw new Error('Invalid runtime config relative path.');
  }
  return true;
}

export function buildRuntimeConfigPayload(plan) {
  const payload = {
    schemaVersion: 1,
    storageBackend: plan.storageBackend,
    siteId: plan.siteId,
    generatedBy: 'site-builder-runtime-installer',
    allowedSiteRoot: plan.sharePointSiteUrl,
    sharePointSiteUrl: plan.sharePointSiteUrl,
  };
  if (plan.storageBackend === 'mongo') payload.backendApiUrl = plan.backendApiUrl.replace(/\/+$/g, '');
  return payload;
}

export function buildRuntimeConfigWrites(plan) {
  const payload = JSON.stringify(buildRuntimeConfigPayload(plan), null, 2);
  return [{
    serverRelativePath: plan.runtimeConfigRel,
    content: `${payload}\n`,
    contentType: 'application/json; charset=utf-8',
  }];
}

export function installRuntimeConfig({ plan, config, dryRun = false, fsAdapter = fs } = {}) {
  assertSafeRuntimeConfigPlan(plan);

  const writes = buildRuntimeConfigWrites(plan);
  const webDav = (serverRelativePath) => config.toWebDav(serverRelativePath);

  const payload = writes.map((file) => ({
    ...file,
    webDavPath: webDav(file.serverRelativePath),
  }));

  if (dryRun) {
    return { installed: false, writes: payload };
  }

  const distWebDavPath = config.toWebDav(plan.distRel);
  if (!fsAdapter.existsSync(distWebDavPath)) {
    throw new Error(`dist folder does not exist. Refusing to write runtime config: ${distWebDavPath}`);
  }

  fsAdapter.mkdirSync(config.toWebDav(plan.distRel), { recursive: true });
  for (const write of payload) {
    fsAdapter.writeFileSync(write.webDavPath, write.content, 'utf8');
  }

  return {
    installed: true,
    writes: payload,
  };
}

export { ALLOWED_RUNTIME_FILE_NAMES };
