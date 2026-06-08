const RUNTIME_CONFIG_FILENAMES = ['sitebuilder-runtime-config.json', 'runtime-config.json'];

let runtimeConfigPromise = null;
let runtimeConfigLoaded = false;
let runtimeConfigSource = null;
let lastResolvedConfig = null;
let lastConsoleMessage = null;

function asString(value) {
  return String(value || '').trim();
}

function sanitizeBackend(value) {
  const normalized = asString(value).toLowerCase();
  if (!normalized) return '';
  if (normalized === 'mongo') return 'mongo';
  if (normalized === 'sharepoint-readonly') return 'sharepoint-readonly';
  if (normalized === 'local-dev') return 'local-dev';
  return normalized;
}

function normalizeCandidate(candidate = {}) {
  const storageBackend = sanitizeBackend(candidate.storageBackend || candidate.backendStorage || candidate.storage || candidate.BACKEND);
  const backendApiUrl = asString(candidate.backendApiUrl || candidate.backendUrl || candidate.apiUrl || candidate.API_URL);
  const siteId = asString(candidate.siteId || candidate.site || candidate.siteCode);
  const apiKey = asString(candidate.apiKey || candidate.siteKey || candidate.key);

  if (!storageBackend && !backendApiUrl && !siteId && !apiKey) {
    return null;
  }

  return {
    storageBackend,
    backendApiUrl,
    siteId,
    apiKey,
  };
}

function loadEmbeddedRuntimeConfig() {
  const runtimeGlobal = typeof window !== 'undefined'
    ? (window.SITE_BUILDER_RUNTIME_CONFIG || window.__SITE_BUILDER_RUNTIME_CONFIG__)
    : null;
  if (!runtimeGlobal) return null;
  const normalized = normalizeCandidate(runtimeGlobal);
  if (!normalized) return null;
  return { source: 'window-runtime-config', config: normalized };
}

function isJsonResponseOk(response) {
  return response && Number(response.status) >= 200 && Number(response.status) < 300;
}

async function loadRuntimeConfigFile(url) {
  try {
    const response = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
    if (!isJsonResponseOk(response)) {
      if (response.status === 404) return null;
      throw new Error(`Runtime config request to ${url} failed with ${response.status}`);
    }
    const parsed = await response.json();
    const normalized = normalizeCandidate(parsed);
    if (!normalized) return null;
    return { source: `fetch:${url}`, config: normalized };
  } catch (error) {
    console.warn('[site-builder-runtime-config] Failed to load runtime config from file:', error.message);
    return null;
  }
}

async function resolveRuntimeConfig() {
  if (typeof window === 'undefined') {
    runtimeConfigLoaded = true;
    runtimeConfigSource = 'node';
    lastResolvedConfig = {};
    lastConsoleMessage = 'Runtime config is not applicable on Node runtime.';
    return lastResolvedConfig;
  }

  const embedded = loadEmbeddedRuntimeConfig();
  if (embedded) {
    runtimeConfigLoaded = true;
    runtimeConfigSource = embedded.source;
    lastResolvedConfig = embedded.config;
    lastConsoleMessage = `Loaded runtime config from ${embedded.source}.`;
    console.info(`[site-builder-runtime-config] ${lastConsoleMessage}`);
    return lastResolvedConfig;
  }

  const baseUrl = new URL('./', window.location.href);
  for (const fileName of RUNTIME_CONFIG_FILENAMES) {
    const candidateUrl = new URL(fileName, baseUrl).toString();
    const loaded = await loadRuntimeConfigFile(candidateUrl);
    if (loaded) {
      runtimeConfigLoaded = true;
      runtimeConfigSource = loaded.source;
      lastResolvedConfig = loaded.config;
      lastConsoleMessage = `Loaded runtime config from file: ${fileName}`;
      console.info(`[site-builder-runtime-config] ${lastConsoleMessage}`);
      return lastResolvedConfig;
    }
  }

  runtimeConfigLoaded = true;
  runtimeConfigSource = 'vite-env';
  lastResolvedConfig = {};
  lastConsoleMessage = 'No runtime config file found. Using build-time Vite env values.';
  console.info(`[site-builder-runtime-config] ${lastConsoleMessage}`);
  return lastResolvedConfig;
}

export function getRuntimeConfigSource() {
  return runtimeConfigSource;
}

export function getRuntimeConfig() {
  return runtimeConfigLoaded ? lastResolvedConfig : null;
}

export function clearRuntimeConfigForTests() {
  runtimeConfigPromise = null;
  runtimeConfigLoaded = false;
  runtimeConfigSource = null;
  lastResolvedConfig = null;
  lastConsoleMessage = null;
}

export function setRuntimeConfigForTests(config = {}) {
  runtimeConfigPromise = null;
  runtimeConfigLoaded = true;
  runtimeConfigSource = 'test';
  lastResolvedConfig = normalizeCandidate(config) || {};
  lastConsoleMessage = 'Runtime config was forced for tests.';
}

export async function loadRuntimeConfig() {
  if (runtimeConfigLoaded && runtimeConfigPromise === null) {
    return lastResolvedConfig || {};
  }

  if (!runtimeConfigPromise) {
    runtimeConfigPromise = resolveRuntimeConfig();
  }

  return runtimeConfigPromise;
}

export function getRuntimeLog() {
  return {
    source: runtimeConfigSource,
    message: lastConsoleMessage,
    loaded: runtimeConfigLoaded,
  };
}

export function getRuntimeValue(key, fallback = '') {
  const config = getRuntimeConfig() || {};
  switch (key) {
    case 'storageBackend':
      return config.storageBackend || '';
    case 'backendApiUrl':
      return config.backendApiUrl || '';
    case 'siteId':
      return config.siteId || '';
    case 'apiKey':
      return config.apiKey || '';
    default:
      return fallback;
  }
}
