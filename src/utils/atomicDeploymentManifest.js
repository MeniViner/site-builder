const text = (value) => String(value ?? '').trim();

const normalizeRelativePath = (value) => {
  const raw = text(value).replace(/\\/g, '/').replace(/^\.\//, '');
  if (!raw || raw.startsWith('/') || raw.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid deployment manifest path "${raw || '(empty)'}".`);
  }
  return raw;
};

export function extractLocalIndexReferences(indexHtml) {
  const references = new Set();
  const matches = String(indexHtml || '').matchAll(/<(?:script|link|img|source|video|audio)\b[^>]*(?:src|href)\s*=\s*["']([^"']+)["']/gi);
  for (const match of matches) {
    const raw = text(match[1]);
    if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(raw)) continue;
    const reference = raw.split(/[?#]/, 1)[0];
    if (!reference || reference.startsWith('/')) continue;
    references.add(normalizeRelativePath(reference));
  }
  return [...references].sort();
}

export function normalizeAtomicBuildManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Bootstrap manifest must be a JSON object.');
  if (value.schemaVersion !== 4) throw new Error(`Unsupported bootstrap manifest schema "${value.schemaVersion || '(missing)'}".`);
  if (!text(value.buildId)) throw new Error('Bootstrap manifest is missing buildId.');
  if (value.entryPoint !== 'index.html' || value.commitFile !== 'index.html') {
    throw new Error('Bootstrap manifest must designate index.html as the commit file.');
  }
  const seen = new Set();
  const files = (Array.isArray(value.files) ? value.files : []).map((file) => {
    const path = normalizeRelativePath(file?.path);
    if (seen.has(path)) throw new Error(`Bootstrap manifest contains duplicate ${path}.`);
    seen.add(path);
    if (!Number.isInteger(file?.size) || file.size < 0) throw new Error(`Bootstrap manifest has invalid size for ${path}.`);
    const sha256 = text(file?.sha256).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`Bootstrap manifest has invalid SHA-256 for ${path}.`);
    return Object.freeze({ path, size: file.size, sha256 });
  });
  if (files.length === 0 || value.fileCount !== files.length || !seen.has('index.html')) {
    throw new Error('Bootstrap manifest file list is incomplete.');
  }
  return Object.freeze({
    ...value,
    buildId: text(value.buildId),
    files: Object.freeze(files),
    indexReferences: Object.freeze([...(value.indexReferences || [])].map(normalizeRelativePath).sort()),
  });
}

export function assertIndexReferencesMatchManifest(manifest, indexHtml) {
  const references = extractLocalIndexReferences(indexHtml);
  const paths = new Set(manifest.files.map((file) => file.path));
  for (const reference of references) {
    if (!paths.has(reference)) throw new Error(`Bootstrap index.html references missing manifest file ${reference}.`);
  }
  if (JSON.stringify(references) !== JSON.stringify([...manifest.indexReferences])) {
    throw new Error('Bootstrap index.html references do not match its manifest.');
  }
  return references;
}

export function orderFilesForAtomicDeployment(files) {
  const rank = (file) => {
    if (/^assets\/.*\.js$/i.test(file.path)) return 0;
    if (/^assets\/.*\.css$/i.test(file.path)) return 1;
    if (/\.(?:woff2?|ttf|otf|png|jpe?g|gif|svg|webp|ico|mp4|webm|mp3|wav)$/i.test(file.path)) return 2;
    return 3;
  };
  return [...files]
    .filter((file) => file.path !== 'index.html')
    .sort((left, right) => rank(left) - rank(right) || left.path.localeCompare(right.path));
}

