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
  const rawSite = cli.site || cli['site-code'] || config?.siteCode || '';
  const storageBackend = String(cli['storage-backend'] || cli.storageBackend || 'mongo').trim().toLowerCase();
  const backendApiUrl = String(cli['backend-url'] || cli.backendUrl || cli['api-url'] || '').trim();
  const apiKey = String(cli['api-key'] || cli.apiKey || '').trim();
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

  return {
    siteCode: String(rawSite).replace(/^\/+|\/+$/g, ''),
    siteId,
    storageBackend,
    backendApiUrl,
    apiKey,
    filename,
    distRel,
    runtimeConfigRel,
    runtimeConfigUrl,
  };
}

export function assertSafeRuntimeConfigPlan(plan) {
  if (!plan?.runtimeConfigRel || !plan.runtimeConfigRel.startsWith('/')) {
    throw new Error('Invalid runtime config plan: missing runtimeConfigRel');
  }
  if (plan.storageBackend !== 'mongo') {
    throw new Error(`Unsupported storageBackend ${plan.storageBackend}. Expected mongo for runtime helper install.`);
  }
  if (!plan.backendApiUrl) {
    throw new Error('backendApiUrl is required for runtime config.');
  }
  if (!plan.apiKey) {
    throw new Error('apiKey is required for runtime config (VITE_SITE_BUILDER_API_KEY).');
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
  return {
    storageBackend: 'mongo',
    backendApiUrl: plan.backendApiUrl,
    siteId: plan.siteId,
    apiKey: plan.apiKey,
    notes: 'development temporary config. Remove for production.',
  };
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
