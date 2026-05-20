// migrate-base64-images-to-sharepoint.js
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parseCliArgs, resolveConfig } from './sp-env.js';

const IMAGE_FIELDS = ['image_url', 'imageUrl', 'ImageUrl', 'Imageurl', 'ImageURL', 'imageURL', 'image'];
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'dist', 'migrated-images');

const log = (message) => console.log(`[image-migrate] ${message}`);
const fail = (message) => {
  console.error(`[image-migrate] Error: ${message}`);
  process.exit(1);
};

const normalizeServerRelative = (...parts) =>
  `/${parts.flatMap((part) => String(part || '').split('/').filter(Boolean)).join('/')}`;

const toServerRelativePath = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^https?:\/\//i.test(raw)) {
    try {
      return decodeURIComponent(new URL(raw).pathname);
    } catch {
      return '';
    }
  }

  return raw.startsWith('/') ? decodeURIComponent(raw) : '';
};

const toSharePointAbsoluteUrl = (host, serverRelativePath) => {
  const encodedPath = String(serverRelativePath || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://${host}${encodedPath}`;
};

const ensureArrayPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.documents)) return payload.documents;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  throw new Error('Input JSON must be an array, or an object with documents/items/data array');
};

const parseJsonFile = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) throw new Error('Input JSON file is empty');

  try {
    return JSON.parse(raw);
  } catch (jsonError) {
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) throw jsonError;
    return lines.map((line) => JSON.parse(line));
  }
};

const findImageField = (item) => IMAGE_FIELDS.find((field) => typeof item?.[field] === 'string' && item[field].trim());

const parseDataUrl = (value) => {
  const raw = String(value || '').trim();
  const match = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/is.exec(raw);
  if (!match) return null;

  const mimeType = (match[1] || 'application/octet-stream').toLowerCase();
  const base64 = match[2].replace(/\s+/g, '');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) return null;

  return { mimeType, bytes };
};

const extensionForMime = (mimeType) => {
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
  };
  return map[mimeType] || 'bin';
};

const sanitizeFileNamePart = (value, fallback) => {
  const text = String(value ?? '').trim();
  const cleaned = text
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
};

const getObjectIdText = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (typeof value.$oid === 'string') return value.$oid;
    if (typeof value.toString === 'function') {
      const text = value.toString();
      return text === '[object Object]' ? '' : text;
    }
  }
  return '';
};

const buildFileName = ({ item, index, extension, prefix }) => {
  const sku = sanitizeFileNamePart(item?.sku, '');
  const name = sanitizeFileNamePart(item?.name, '');
  const id = sanitizeFileNamePart(getObjectIdText(item?._id), '');
  const hash = crypto
    .createHash('sha1')
    .update(JSON.stringify({ sku, name, id, index }))
    .digest('hex')
    .slice(0, 8);

  const baseParts = [prefix, sku, name, id || hash].filter(Boolean);
  return `${baseParts.join('-')}.${extension}`;
};

const writeFileSafe = (filePath, bytes, dryRun) => {
  if (dryRun) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bytes);
};

const usage = () => `
Usage:
  node scripts/migrate-base64-images-to-sharepoint.js --input products.json --target-folder /sites/<site>/siteDB/images/products --output products.sp.json

Options:
  --input            Required. Mongo export JSON file. Supports array JSON or NDJSON.
  --target-folder    Required. SharePoint server-relative folder or full SharePoint URL.
  --output           Output JSON path. Default: <input>.sharepoint-images.json
  --local-dir        Local backup folder for decoded images. Default: dist/migrated-images
  --field            Image field to update. Default: auto-detect image_url/imageUrl/ImageUrl/Imageurl/ImageURL/image per item.
  --prefix           Optional file name prefix. Default: product
  --host             SharePoint host. Default/env: portal.army.idf
  --site             Site code, used for WebDAV config defaults.
  --env              Env file for site config. Default: .env.production
  --dry-run          Parse and print plan without writing files.
`;

const cli = parseCliArgs();
if (cli.help || cli.h) {
  console.log(usage());
  process.exit(0);
}

const inputPath = cli.input ? path.resolve(process.cwd(), String(cli.input)) : '';
if (!inputPath) fail('Missing --input');
if (!fs.existsSync(inputPath)) fail(`Input file not found: ${inputPath}`);

const targetFolderInput = String(cli['target-folder'] || '').trim();
if (!targetFolderInput) fail('Missing --target-folder');

const envPath = cli.env ? path.resolve(process.cwd(), String(cli.env)) : path.resolve(process.cwd(), '.env.production');
const config = resolveConfig({ envFilePath: envPath, cli });
const dryRun = cli['dry-run'] === true || String(cli['dry-run'] || '').toLowerCase() === 'true';
const localDir = cli['local-dir'] ? path.resolve(process.cwd(), String(cli['local-dir'])) : DEFAULT_OUTPUT_DIR;
const outputPath = cli.output
  ? path.resolve(process.cwd(), String(cli.output))
  : path.resolve(path.dirname(inputPath), `${path.basename(inputPath, path.extname(inputPath))}.sharepoint-images.json`);
const forcedField = String(cli.field || '').trim();
const prefix = sanitizeFileNamePart(cli.prefix, 'product');

const targetFolderRel = toServerRelativePath(targetFolderInput) || normalizeServerRelative(targetFolderInput);
const targetWebDavFolder = config.toWebDav(targetFolderRel);
const absoluteUrlBase = toSharePointAbsoluteUrl(config.host, targetFolderRel);

const payload = parseJsonFile(inputPath);
const documents = ensureArrayPayload(payload);
const migrated = [];
const stats = {
  total: documents.length,
  migrated: 0,
  skippedNoField: 0,
  skippedNotBase64: 0,
  failed: 0,
};

log(`input=${inputPath}`);
log(`target=${targetFolderRel}`);
log(`webdav=${targetWebDavFolder}`);
if (dryRun) log('dry-run enabled');

for (let index = 0; index < documents.length; index += 1) {
  const item = documents[index];
  if (!item || typeof item !== 'object') {
    migrated.push(item);
    stats.skippedNoField += 1;
    continue;
  }

  const field = forcedField || findImageField(item);
  if (!field) {
    migrated.push(item);
    stats.skippedNoField += 1;
    continue;
  }

  const parsed = parseDataUrl(item[field]);
  if (!parsed) {
    migrated.push(item);
    stats.skippedNotBase64 += 1;
    continue;
  }

  try {
    const extension = extensionForMime(parsed.mimeType);
    const fileName = buildFileName({ item, index, extension, prefix });
    const localFilePath = path.join(localDir, fileName);
    const sharePointFilePath = path.win32.join(targetWebDavFolder, fileName);
    const nextUrl = `${absoluteUrlBase}/${encodeURIComponent(fileName)}`;

    writeFileSafe(localFilePath, parsed.bytes, dryRun);
    writeFileSafe(sharePointFilePath, parsed.bytes, dryRun);

    migrated.push({
      ...item,
      [field]: nextUrl,
    });
    stats.migrated += 1;

    log(`${dryRun ? 'would migrate' : 'migrated'} ${index + 1}/${documents.length}: ${field} -> ${nextUrl}`);
  } catch (error) {
    stats.failed += 1;
    migrated.push(item);
    log(`failed ${index + 1}/${documents.length}: ${error.message}`);
  }
}

if (!dryRun) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(migrated, null, 2)}\n`, 'utf8');
}

log(`done | total=${stats.total} migrated=${stats.migrated} skippedNoField=${stats.skippedNoField} skippedNotBase64=${stats.skippedNotBase64} failed=${stats.failed}`);
log(`${dryRun ? 'would write' : 'wrote'} output=${outputPath}`);

if (stats.failed > 0) process.exitCode = 1;
