import fs from 'fs'
import os from 'os'
import path from 'path'
import process from 'process'
import { fileURLToPath, pathToFileURL } from 'url'

export const LOCAL_FILE_BRIDGE_PATH = '/__sitebuilder-local-file'

export const contentTypes = {
  '.7z': 'application/x-7z-compressed',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
}

const viewStorageKey = 'sitebuilder.localFileBridge.view.v2'
const SEARCH_MAX_DEPTH = 8
const SEARCH_RESULT_LIMIT = 80
const SEARCH_VISIT_LIMIT = 2500
const SEARCH_DEFERRED_DIR_NAMES = new Set([
  '.cache',
  '.git',
  '.hg',
  '.next',
  '.nuxt',
  '.pnpm-store',
  '.svn',
  'bower_components',
  'dist',
  'node_modules',
  'vendor',
])

const fileKindExtensions = {
  archive: new Set(['.7z', '.gz', '.rar', '.tar', '.zip']),
  audio: new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.wav']),
  code: new Set(['.css', '.html', '.js', '.jsx', '.json', '.md', '.mjs', '.ts', '.tsx', '.xml', '.yml', '.yaml']),
  document: new Set(['.doc', '.docx', '.odt', '.pages']),
  image: new Set(['.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']),
  pdf: new Set(['.pdf']),
  presentation: new Set(['.key', '.ppt', '.pptx']),
  sheet: new Set(['.csv', '.numbers', '.ods', '.xls', '.xlsx']),
  text: new Set(['.log', '.rtf', '.txt']),
  video: new Set(['.avi', '.mkv', '.mov', '.mp4', '.webm']),
}

const htmlEscape = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const jsonForScript = (value) => JSON.stringify(value)
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029')

const toPathApi = (platform = process.platform) => (platform === 'win32' ? path.win32 : path.posix)

function encodePathname(pathname) {
  return pathname
    .split('/')
    .map((segment) => encodeURIComponent(segment).replace(/%3A/gi, ':'))
    .join('/')
}

export function filePathFromHref(href, platform = process.platform) {
  const url = new URL(String(href || ''))
  if (url.protocol !== 'file:') return ''

  if (platform === 'win32') {
    if (url.hostname) {
      return `\\\\${url.hostname}${decodeURIComponent(url.pathname).replace(/\//g, '\\')}`
    }
    return decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\')
  }

  if (url.hostname) return ''
  return fileURLToPath(url)
}

export function fileHrefFromPath(filePath, platform = process.platform) {
  const value = String(filePath || '').trim()
  if (!value) return ''

  if (platform === 'win32') {
    const normalized = value.replace(/\//g, '\\')
    if (/^\\\\/.test(normalized)) {
      const [host, ...segments] = normalized.replace(/^\\\\+/, '').split('\\').filter(Boolean)
      if (!host) return ''
      const encodedPath = segments.map((segment) => encodeURIComponent(segment)).join('/')
      return `file://${host}${encodedPath ? `/${encodedPath}` : ''}`
    }

    const pathname = normalized.replace(/\\/g, '/').replace(/^([^/])/, '/$1')
    return `file://${encodePathname(pathname)}`
  }

  return pathToFileURL(value).href
}

function isAbsoluteUserPath(value, platform = process.platform) {
  if (platform === 'win32') {
    return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value) || /^\/[A-Za-z]:\//.test(value)
  }
  return path.posix.isAbsolute(value)
}

function expandHomePath(value, platform = process.platform) {
  if (platform === 'win32') return value
  if (value === '~') return os.homedir()
  if (value.startsWith('~/')) return path.posix.join(os.homedir(), value.slice(2))
  return value
}

export function fileHrefFromUserPath(rawPath, basePath = '', platform = process.platform) {
  const input = String(rawPath || '').trim()
  if (!input) return ''

  if (/^file:/i.test(input)) {
    const filePath = filePathFromHref(input, platform)
    return filePath ? fileHrefFromPath(filePath, platform) : ''
  }

  const pathApi = toPathApi(platform)
  const expandedInput = expandHomePath(input, platform)
  const resolvedPath = isAbsoluteUserPath(expandedInput, platform)
    ? pathApi.normalize(expandedInput)
    : pathApi.resolve(basePath || process.cwd(), expandedInput)

  return fileHrefFromPath(resolvedPath, platform)
}

export function bridgeHrefFromFileHref(fileHref) {
  return `${LOCAL_FILE_BRIDGE_PATH}?href=${encodeURIComponent(fileHref)}`
}

export function bridgeHrefFromPath(filePath, platform = process.platform) {
  return bridgeHrefFromFileHref(fileHrefFromPath(filePath, platform))
}

function getFileKind(ext, isDirectory) {
  if (isDirectory) return 'folder'
  const lower = ext.toLowerCase()
  const found = Object.entries(fileKindExtensions).find(([, extensions]) => extensions.has(lower))
  return found?.[0] || 'file'
}

export function formatBytes(size) {
  const value = Number(size)
  if (!Number.isFinite(value) || value < 0) return ''
  if (value === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const amount = value / (1024 ** index)
  const fractionDigits = amount >= 100 || index === 0 ? 0 : 1
  return `${amount.toFixed(fractionDigits)} ${units[index]}`
}

export function formatFileDate(date) {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

function getEntryLabel(entry) {
  if (entry.isDirectory) return 'תיקייה'
  if (entry.ext) return entry.ext.replace(/^\./, '').toUpperCase()
  return 'קובץ'
}

function createEntryModel({ dirent, currentPath, platform = process.platform }) {
  const fullPath = toPathApi(platform).join(currentPath, dirent.name)
  let stat = null
  let readError = ''

  try {
    stat = fs.statSync(fullPath)
  } catch (error) {
    readError = error.message
  }

  const isDirectory = stat?.isDirectory() ?? dirent.isDirectory()
  const ext = isDirectory ? '' : toPathApi(platform).extname(dirent.name).toLowerCase()
  const kind = getFileKind(ext, isDirectory)
  const modifiedDate = stat?.mtime || null

  return {
    ext,
    fullPath,
    href: bridgeHrefFromPath(fullPath, platform),
    isDirectory,
    isReadable: Boolean(stat),
    kind,
    label: getEntryLabel({ ext, isDirectory }),
    modifiedIso: modifiedDate ? modifiedDate.toISOString() : '',
    modifiedLabel: modifiedDate ? formatFileDate(modifiedDate) : 'לא זמין',
    name: dirent.name,
    readError,
    size: stat?.size ?? null,
    sizeLabel: isDirectory ? '—' : formatBytes(stat?.size),
  }
}

function normalizeSearchText(value) {
  return String(value || '').trim().toLocaleLowerCase('he-IL')
}

function relativePathFromRoot(fullPath, rootPath, platform = process.platform) {
  const pathApi = toPathApi(platform)
  const relativePath = pathApi.relative(rootPath, fullPath)
  return relativePath || pathApi.basename(fullPath)
}

function createSearchResultModel({ fullPath, rootPath, stat, platform = process.platform }) {
  const pathApi = toPathApi(platform)
  const isDirectory = stat.isDirectory()
  const name = pathApi.basename(fullPath)
  const ext = isDirectory ? '' : pathApi.extname(name).toLowerCase()
  const kind = getFileKind(ext, isDirectory)
  const parentPath = pathApi.dirname(fullPath)
  const relativePath = relativePathFromRoot(fullPath, rootPath, platform)

  return {
    ext,
    fullPath,
    href: bridgeHrefFromPath(fullPath, platform),
    isDirectory,
    kind,
    label: getEntryLabel({ ext, isDirectory }),
    modifiedIso: stat.mtime ? stat.mtime.toISOString() : '',
    modifiedLabel: stat.mtime ? formatFileDate(stat.mtime) : 'לא זמין',
    name,
    parentHref: bridgeHrefFromPath(parentPath, platform),
    parentPath,
    relativePath,
    size: stat.size,
    sizeLabel: isDirectory ? '—' : formatBytes(stat.size),
  }
}

function searchDirPriority(dirent, query) {
  if (!dirent.isDirectory()) return 0
  const name = normalizeSearchText(dirent.name)
  if (query && name.includes(query)) return -1
  if (SEARCH_DEFERRED_DIR_NAMES.has(name)) return 3
  if (name.startsWith('.')) return 2
  return 0
}

export function searchDirectoryModel(rootPath, query, platform = process.platform, options = {}) {
  const searchQuery = normalizeSearchText(query)
  const resultLimit = Number.isFinite(Number(options.resultLimit)) ? Number(options.resultLimit) : SEARCH_RESULT_LIMIT
  const visitLimit = Number.isFinite(Number(options.visitLimit)) ? Number(options.visitLimit) : SEARCH_VISIT_LIMIT
  const maxDepth = Number.isFinite(Number(options.maxDepth)) ? Number(options.maxDepth) : SEARCH_MAX_DEPTH
  const pathApi = toPathApi(platform)
  const normalizedRootPath = pathApi.resolve(rootPath)
  const results = []
  const stack = [{ depth: 0, dirPath: normalizedRootPath }]
  let skippedUnreadable = 0
  let visited = 0
  let truncated = false

  if (!searchQuery) {
    return {
      maxDepth,
      query: '',
      resultCount: 0,
      resultLimit,
      results,
      rootPath: normalizedRootPath,
      skippedUnreadable,
      truncated,
      visited,
      visitLimit,
    }
  }

  while (stack.length && results.length < resultLimit && visited < visitLimit) {
    const { depth, dirPath } = stack.shift()
    let dirents = []

    try {
      dirents = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch {
      skippedUnreadable += 1
      continue
    }

    dirents.sort((a, b) => {
      const directoryRank = Number(b.isDirectory()) - Number(a.isDirectory())
      if (directoryRank !== 0) return directoryRank
      const priorityRank = searchDirPriority(a, searchQuery) - searchDirPriority(b, searchQuery)
      if (priorityRank !== 0) return priorityRank
      return a.name.localeCompare(b.name, 'he')
    })

    for (const dirent of dirents) {
      if (results.length >= resultLimit || visited >= visitLimit) break

      const fullPath = pathApi.join(dirPath, dirent.name)
      visited += 1

      let stat = null
      try {
        stat = fs.statSync(fullPath)
      } catch {
        skippedUnreadable += 1
        continue
      }

      const relativePath = relativePathFromRoot(fullPath, normalizedRootPath, platform)
      const haystack = normalizeSearchText(`${dirent.name} ${relativePath}`)
      if (haystack.includes(searchQuery)) {
        results.push(createSearchResultModel({ fullPath, rootPath: normalizedRootPath, stat, platform }))
      }

      if (stat.isDirectory() && depth < maxDepth && !dirent.isSymbolicLink()) {
        stack.push({ depth: depth + 1, dirPath: fullPath })
      }
    }
  }

  truncated = stack.length > 0 || results.length >= resultLimit || visited >= visitLimit

  return {
    maxDepth,
    query: String(query || '').trim(),
    resultCount: results.length,
    resultLimit,
    results,
    rootPath: normalizedRootPath,
    skippedUnreadable,
    truncated,
    visited,
    visitLimit,
  }
}

export function readDirectoryModel(currentPath, platform = process.platform) {
  const pathApi = toPathApi(platform)
  const normalizedPath = pathApi.resolve(currentPath)
  const entries = fs.readdirSync(normalizedPath, { withFileTypes: true })
    .map((dirent) => createEntryModel({ dirent, currentPath: normalizedPath, platform }))
    .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name, 'he'))

  return {
    breadcrumbs: getBreadcrumbs(normalizedPath, platform),
    currentPath: normalizedPath,
    currentHref: bridgeHrefFromPath(normalizedPath, platform),
    entries,
    itemCount: entries.length,
    parentHref: getParentHref(normalizedPath, platform),
  }
}

export function getParentHref(currentPath, platform = process.platform) {
  const pathApi = toPathApi(platform)
  const parentPath = pathApi.dirname(currentPath)
  if (!parentPath || parentPath === currentPath) return ''
  return bridgeHrefFromPath(parentPath, platform)
}

export function getBreadcrumbs(currentPath, platform = process.platform) {
  const pathApi = toPathApi(platform)
  const parsed = pathApi.parse(pathApi.resolve(currentPath))
  const parts = pathApi.resolve(currentPath).slice(parsed.root.length).split(/[\\/]+/).filter(Boolean)
  const crumbs = []
  let cursor = parsed.root

  crumbs.push({
    href: bridgeHrefFromPath(cursor, platform),
    label: parsed.root || '/',
    path: cursor,
  })

  parts.forEach((part) => {
    cursor = pathApi.join(cursor, part)
    crumbs.push({
      href: bridgeHrefFromPath(cursor, platform),
      label: part,
      path: cursor,
    })
  })

  return crumbs
}

function renderIcon(name) {
  const shared = 'aria-hidden="true" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
  const icons = {
    archive: `<svg ${shared}><path d="M10 21h4"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h8"/><path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/></svg>`,
    audio: `<svg ${shared}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
    back: `<svg ${shared}><path d="m9 18 6-6-6-6"/></svg>`,
    code: `<svg ${shared}><path d="m10 18 4-12"/><path d="m6 8-4 4 4 4"/><path d="m18 8 4 4-4 4"/></svg>`,
    copy: `<svg ${shared}><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    document: `<svg ${shared}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`,
    file: `<svg ${shared}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>`,
    folder: `<svg ${shared}><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>`,
    grid: `<svg ${shared}><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
    image: `<svg ${shared}><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>`,
    list: `<svg ${shared}><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>`,
    pdf: `<svg ${shared}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 17v-4h1.5a1.5 1.5 0 0 1 0 3H8"/><path d="M13 13v4h1a2 2 0 0 0 0-4Z"/><path d="M18 13h-2v4"/><path d="M16 15h2"/></svg>`,
    presentation: `<svg ${shared}><path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/></svg>`,
    refresh: `<svg ${shared}><path d="M21 12a9 9 0 0 0-9-9 9.8 9.8 0 0 0-6.7 2.7L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.8 9.8 0 0 0 6.7-2.7L21 16"/><path d="M16 16h5v5"/></svg>`,
    search: `<svg ${shared}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
    sheet: `<svg ${shared}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M11 9v12"/></svg>`,
    text: `<svg ${shared}><path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/></svg>`,
    up: `<svg ${shared}><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`,
    video: `<svg ${shared}><path d="m16 13 5.2 3.1a.5.5 0 0 0 .8-.4V8.3a.5.5 0 0 0-.8-.4L16 11"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>`,
  }

  return icons[name] || icons.file
}

function renderBreadcrumbs(breadcrumbs) {
  return breadcrumbs.map((crumb, index) => {
    const isLast = index === breadcrumbs.length - 1
    const content = htmlEscape(crumb.label)
    if (isLast) return `<span class="breadcrumb-current" dir="auto">${content}</span>`
    return `<a href="${htmlEscape(crumb.href)}" dir="auto">${content}</a><span class="breadcrumb-separator">/</span>`
  }).join('')
}

function renderEntry(entry) {
  const href = htmlEscape(entry.href)
  const title = htmlEscape(entry.fullPath)
  const targetAttrs = entry.isDirectory ? '' : ' target="_blank" rel="noopener" data-open-file="true"'
  const disabledClass = entry.isReadable ? '' : ' is-unreadable'
  const dateAttr = entry.modifiedIso ? ` datetime="${htmlEscape(entry.modifiedIso)}"` : ''
  const errorTitle = entry.readError ? ` title="${htmlEscape(entry.readError)}"` : ''

  return `<a class="entry kind-${htmlEscape(entry.kind)}${disabledClass}" href="${href}"${targetAttrs} data-entry-kind="${htmlEscape(entry.kind)}" title="${title}">
    <span class="entry-icon">${renderIcon(entry.kind)}</span>
    <span class="entry-name" dir="auto">${htmlEscape(entry.name)}</span>
    <span class="entry-type"${errorTitle}>${htmlEscape(entry.label)}</span>
    <span class="entry-size">${htmlEscape(entry.sizeLabel || '')}</span>
    <time class="entry-date"${dateAttr}>${htmlEscape(entry.modifiedLabel)}</time>
  </a>`
}

function renderEmptyState() {
  return `<div class="empty-state">
    <div class="empty-icon">${renderIcon('folder')}</div>
    <h2>התיקייה ריקה</h2>
    <p>אין כאן קבצים או תיקיות להצגה.</p>
  </div>`
}

function renderDirectoryEntries(entries) {
  if (!entries.length) return renderEmptyState()

  return `<div class="entries" role="list">
    <div class="entry entry-head" aria-hidden="true">
      <span></span>
      <span>שם</span>
      <span>סוג</span>
      <span>גודל</span>
      <span>עודכן</span>
    </div>
    ${entries.map(renderEntry).join('\n')}
  </div>`
}

function renderBridgeStyles() {
  return `<style>
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;800;900&display=swap');

    :root {
      --color-primary-h: 188;
      --color-primary-s: 87%;
      --color-primary-l: 36%;
      --color-primary: var(--color-primary-h) var(--color-primary-s) var(--color-primary-l);
      --color-primary-hex: #0891b2;
      --color-bg-base: #0c0d12;
      --color-bg-card: #1a1c23;
      --color-bg-card-hover: #20232c;
      --color-bg-elevated: #252830;
      --color-bg-chrome: rgba(18, 19, 26, 0.9);
      --color-border-subtle: rgba(255, 255, 255, 0.06);
      --color-border-strong: rgba(255, 255, 255, 0.12);
      --color-text-primary: #f0f1f4;
      --color-text-muted: #9ca3af;
      --shadow-border: 0 0 0 1px rgba(255, 255, 255, 0.08);
      color-scheme: dark;
    }

    :root.light {
      --color-bg-base: #f2f3f5;
      --color-bg-card: #ffffff;
      --color-bg-card-hover: #f9fafb;
      --color-bg-elevated: #eef1f4;
      --color-bg-chrome: rgba(248, 249, 251, 0.92);
      --color-border-subtle: rgba(0, 0, 0, 0.06);
      --color-border-strong: rgba(0, 0, 0, 0.12);
      --color-text-primary: #111827;
      --color-text-muted: #6b7280;
      --shadow-border:
        0 0 0 1px rgba(0, 0, 0, 0.06),
        0 1px 2px -1px rgba(0, 0, 0, 0.06),
        0 2px 4px rgba(0, 0, 0, 0.04);
      color-scheme: light;
    }

    * { box-sizing: border-box; }

    html {
      min-height: 100%;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      min-height: 100vh;
      margin: 0;
      background: var(--color-bg-base);
      color: var(--color-text-primary);
      font-family: Heebo, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    button,
    input {
      font: inherit;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    .file-shell {
      min-height: 100vh;
      padding: clamp(16px, 2.4vw, 30px);
      background:
        linear-gradient(180deg, hsl(var(--color-primary) / 0.08), transparent 220px),
        var(--color-bg-base);
    }

    .app-frame {
      width: min(1280px, 100%);
      margin: 0 auto;
    }

    .app-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 16px;
    }

    .title-cluster {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
      text-align: right;
    }

    .brand-mark,
    .empty-icon {
      display: inline-flex;
      width: 52px;
      height: 52px;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: hsl(var(--color-primary) / 0.14);
      color: hsl(var(--color-primary) / 0.96);
      box-shadow: var(--shadow-border), 0 12px 28px hsl(var(--color-primary) / 0.1);
    }

    .eyebrow {
      margin: 0 0 3px;
      color: hsl(var(--color-primary) / 0.95);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0;
    }

    h1 {
      margin: 0;
      color: var(--color-text-primary);
      font-size: clamp(28px, 3.3vw, 48px);
      font-weight: 900;
      letter-spacing: 0;
      line-height: 1.05;
      text-wrap: balance;
    }

    .header-meta {
      display: flex;
      min-height: 40px;
      align-items: center;
      gap: 8px;
      color: var(--color-text-muted);
      font-size: 13px;
      font-weight: 900;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .toolbar {
      position: relative;
      z-index: 40;
      display: grid;
      grid-template-columns: auto minmax(280px, 1fr) auto;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
      padding: 10px;
      border-radius: 8px;
      background: var(--color-bg-chrome);
      box-shadow: var(--shadow-border);
      backdrop-filter: blur(14px);
      overflow: visible;
    }

    .action-group {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .search-cluster {
      position: relative;
      z-index: 60;
      display: inline-flex;
      align-items: center;
      min-width: 40px;
    }

    .search-toggle {
      position: relative;
      z-index: 3;
    }

    .search-cluster.is-open .search-toggle {
      background: hsl(var(--color-primary) / 0.95);
      color: white;
      box-shadow: 0 8px 20px hsl(var(--color-primary) / 0.24);
    }

    .search-drawer {
      position: absolute;
      inset-block-start: 0;
      inset-inline-start: 0;
      z-index: 70;
      width: min(380px, calc(100vw - 56px));
      height: 40px;
      opacity: 0;
      filter: blur(4px);
      pointer-events: none;
      transform: translateX(10px) scaleX(0.25);
      transform-origin: right center;
      transition-property: opacity, filter, transform;
      transition-duration: 220ms;
      transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
    }

    .search-cluster.is-open .search-drawer {
      opacity: 1;
      filter: blur(0);
      pointer-events: auto;
      transform: translateX(0) scaleX(1);
    }

    .search-input {
      width: 100%;
      height: 40px;
      border: 0;
      border-radius: 8px;
      background: var(--color-bg-elevated);
      color: var(--color-text-primary);
      padding: 0 48px 0 14px;
      direction: rtl;
      text-align: right;
      font-size: 13px;
      font-weight: 800;
      outline: none;
      box-shadow: var(--shadow-border), 0 12px 28px rgba(0, 0, 0, 0.16);
    }

    .search-input::placeholder {
      color: var(--color-text-muted);
      opacity: 0.82;
    }

    .search-input:focus-visible {
      outline: 2px solid hsl(var(--color-primary) / 0.5);
      outline-offset: 2px;
    }

    .search-results {
      position: absolute;
      inset-block-start: 48px;
      inset-inline-start: 0;
      z-index: 80;
      width: min(520px, calc(100vw - 56px));
      max-height: min(520px, calc(100vh - 190px));
      overflow: auto;
      border-radius: 8px;
      background: var(--color-bg-card);
      box-shadow:
        var(--shadow-border),
        0 22px 54px rgba(0, 0, 0, 0.28);
      opacity: 0;
      filter: blur(4px);
      pointer-events: none;
      transform: translateY(10px);
      transition-property: opacity, filter, transform;
      transition-duration: 180ms;
      transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
    }

    .search-cluster.is-open .search-results:not([hidden]) {
      opacity: 1;
      filter: blur(0);
      pointer-events: auto;
      transform: translateY(0);
    }

    .search-results[hidden] {
      display: block;
      opacity: 0;
      pointer-events: none;
    }

    .search-status,
    .search-empty {
      padding: 16px;
      color: var(--color-text-muted);
      font-size: 13px;
      font-weight: 800;
      text-align: right;
      text-wrap: pretty;
    }

    .search-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--color-border-subtle);
      color: var(--color-text-muted);
      font-size: 12px;
      font-weight: 900;
      font-variant-numeric: tabular-nums;
    }

    .search-list {
      display: grid;
      gap: 6px;
      padding: 8px;
    }

    .search-result {
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      min-height: 58px;
      border-radius: 8px;
      padding: 8px;
      background: var(--color-bg-elevated);
      opacity: 0;
      filter: blur(4px);
      transform: translateY(8px);
      animation: search-result-in 280ms cubic-bezier(0.2, 0, 0, 1) forwards;
      animation-delay: calc(var(--result-index, 0) * 42ms);
      transition-property: background-color, box-shadow, transform;
      transition-duration: 160ms;
      transition-timing-function: ease-out;
    }

    .search-result:hover {
      background: var(--color-bg-card-hover);
      box-shadow: 0 0 0 1px hsl(var(--color-primary) / 0.22);
      transform: translateY(-1px);
    }

    .search-result-icon {
      display: inline-flex;
      width: 40px;
      height: 40px;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: hsl(var(--color-primary) / 0.12);
      color: hsl(var(--color-primary) / 0.96);
    }

    .search-result-main {
      min-width: 0;
      text-align: right;
    }

    .search-result-name,
    .search-result-path {
      display: block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .search-result-name {
      color: var(--color-text-primary);
      font-size: 14px;
      font-weight: 900;
    }

    .search-result-path {
      margin-top: 3px;
      color: var(--color-text-muted);
      direction: ltr;
      font-size: 11px;
      font-weight: 800;
      text-align: left;
    }

    .search-result-tag {
      color: var(--color-text-muted);
      font-size: 11px;
      font-weight: 900;
      white-space: nowrap;
    }

    @keyframes search-result-in {
      to {
        opacity: 1;
        filter: blur(0);
        transform: translateY(0);
      }
    }

    .icon-button,
    .text-button,
    .view-button {
      display: inline-flex;
      min-width: 40px;
      height: 40px;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--color-text-primary);
      cursor: pointer;
      transition-property: background-color, color, transform, box-shadow;
      transition-duration: 160ms;
      transition-timing-function: ease-out;
    }

    .icon-button:hover,
    .text-button:hover,
    .view-button:hover {
      background: hsl(var(--color-primary) / 0.12);
      color: hsl(var(--color-primary) / 0.96);
    }

    .icon-button:active,
    .text-button:active,
    .view-button:active {
      transform: scale(0.96);
    }

    .icon-button:focus-visible,
    .text-button:focus-visible,
    .view-button:focus-visible,
    .path-input:focus-visible {
      outline: 2px solid hsl(var(--color-primary) / 0.5);
      outline-offset: 2px;
    }

    .icon-button[aria-disabled="true"] {
      cursor: default;
      opacity: 0.42;
      pointer-events: none;
    }

    .text-button {
      min-width: auto;
      padding: 0 16px;
      background: hsl(var(--color-primary) / 0.12);
      color: hsl(var(--color-primary) / 0.96);
      font-size: 13px;
      font-weight: 900;
      white-space: nowrap;
    }

    .text-button:hover {
      background: hsl(var(--color-primary) / 0.2);
    }

    .view-toggle {
      display: inline-flex;
      gap: 4px;
      padding: 4px;
      border-radius: 8px;
      background: var(--color-bg-elevated);
      justify-self: end;
    }

    .view-button {
      width: 40px;
    }

    .view-button[aria-pressed="true"] {
      background: hsl(var(--color-primary) / 0.95);
      color: white;
      box-shadow: 0 8px 20px hsl(var(--color-primary) / 0.24);
    }

    .path-form {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 0;
      border-radius: 8px;
      background: transparent;
    }

    .path-label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }

    .path-input {
      width: 100%;
      min-width: 0;
      height: 44px;
      border: 0;
      border-radius: 8px;
      background: var(--color-bg-elevated);
      color: var(--color-text-primary);
      padding: 0 14px;
      direction: ltr;
      text-align: left;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 14px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      outline: none;
    }

    .breadcrumbs {
      position: relative;
      z-index: 1;
      display: flex;
      min-height: 40px;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
      margin-bottom: 18px;
      color: var(--color-text-muted);
      font-size: 13px;
      font-weight: 900;
      scrollbar-width: thin;
    }

    .breadcrumbs a {
      display: inline-flex;
      min-height: 32px;
      align-items: center;
      border-radius: 8px;
      padding: 0 9px;
      transition-property: background-color, color;
      transition-duration: 150ms;
      transition-timing-function: ease-out;
      white-space: nowrap;
    }

    .breadcrumbs a:hover {
      background: hsl(var(--color-primary) / 0.12);
      color: hsl(var(--color-primary) / 0.96);
    }

    .breadcrumb-current {
      color: var(--color-text-primary);
      white-space: nowrap;
    }

    .breadcrumb-separator {
      color: var(--color-text-muted);
      opacity: 0.58;
    }

    .content-panel {
      min-height: 420px;
    }

    .entries {
      display: grid;
      gap: 7px;
    }

    .entry {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) minmax(74px, 120px) minmax(72px, 110px) minmax(112px, 150px);
      align-items: center;
      gap: 10px;
      min-height: 54px;
      border-radius: 8px;
      padding: 7px 12px;
      background: var(--color-bg-card);
      color: var(--color-text-primary);
      box-shadow: var(--shadow-border);
      transition-property: background-color, box-shadow, transform;
      transition-duration: 160ms;
      transition-timing-function: ease-out;
    }

    a.entry:hover {
      background: var(--color-bg-card-hover);
      box-shadow: 0 0 0 1px hsl(var(--color-primary) / 0.24), 0 12px 26px rgba(0, 0, 0, 0.12);
      transform: translateY(-1px);
    }

    a.entry:active {
      transform: scale(0.99);
    }

    .entry-head {
      min-height: 36px;
      background: transparent;
      color: var(--color-text-muted);
      box-shadow: none;
      font-size: 12px;
      font-weight: 900;
    }

    .entry-icon {
      display: inline-flex;
      width: 38px;
      height: 38px;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: hsl(var(--color-primary) / 0.12);
      color: hsl(var(--color-primary) / 0.96);
    }

    .kind-file .entry-icon,
    .kind-text .entry-icon,
    .kind-code .entry-icon {
      background: rgba(148, 163, 184, 0.14);
      color: #94a3b8;
    }

    .kind-pdf .entry-icon {
      background: rgba(239, 68, 68, 0.13);
      color: #ef4444;
    }

    .kind-image .entry-icon,
    .kind-video .entry-icon {
      background: rgba(16, 185, 129, 0.13);
      color: #10b981;
    }

    .kind-sheet .entry-icon {
      background: rgba(34, 197, 94, 0.13);
      color: #22c55e;
    }

    .kind-presentation .entry-icon {
      background: rgba(249, 115, 22, 0.13);
      color: #f97316;
    }

    .entry-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 15px;
      font-weight: 900;
    }

    .entry-type,
    .entry-size,
    .entry-date {
      min-width: 0;
      overflow: hidden;
      color: var(--color-text-muted);
      font-size: 12px;
      font-weight: 800;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .entry-size,
    .entry-date {
      direction: ltr;
      text-align: left;
      font-variant-numeric: tabular-nums;
    }

    .is-unreadable {
      opacity: 0.58;
    }

    .file-shell[data-view="grid"] .entries {
      grid-template-columns: repeat(auto-fill, minmax(188px, 1fr));
      gap: 14px;
    }

    .file-shell[data-view="grid"] .entry-head {
      display: none;
    }

    .file-shell[data-view="grid"] .entry {
      grid-template-columns: 1fr;
      align-content: start;
      min-height: 168px;
      padding: 16px;
    }

    .file-shell[data-view="grid"] .entry-icon {
      width: 52px;
      height: 52px;
      margin-bottom: 4px;
    }

    .file-shell[data-view="grid"] .entry-name {
      white-space: normal;
      line-height: 1.28;
      text-wrap: pretty;
    }

    .file-shell[data-view="grid"] .entry-type,
    .file-shell[data-view="grid"] .entry-size,
    .file-shell[data-view="grid"] .entry-date {
      text-align: right;
    }

    .empty-state,
    .error-state {
      display: grid;
      min-height: 360px;
      place-items: center;
      border-radius: 8px;
      padding: 32px;
      background: var(--color-bg-card);
      box-shadow: var(--shadow-border);
      text-align: center;
    }

    .empty-state h2,
    .error-state h1 {
      margin: 16px 0 6px;
      font-size: 24px;
      font-weight: 900;
      text-wrap: balance;
    }

    .empty-state p,
    .error-state p {
      max-width: 620px;
      margin: 0 auto;
      color: var(--color-text-muted);
      text-wrap: pretty;
    }

    .error-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      margin-top: 18px;
    }

    .icon {
      width: 20px;
      height: 20px;
      flex: 0 0 auto;
    }

    .brand-mark .icon,
    .empty-icon .icon {
      width: 24px;
      height: 24px;
    }

    .toast {
      position: fixed;
      inset-block-end: 18px;
      inset-inline-start: 50%;
      z-index: 20;
      min-width: min(320px, calc(100vw - 32px));
      transform: translateX(-50%) translateY(18px);
      border-radius: 8px;
      background: var(--color-bg-elevated);
      color: var(--color-text-primary);
      padding: 10px 14px;
      box-shadow: 0 18px 42px rgba(0, 0, 0, 0.22), var(--shadow-border);
      font-size: 13px;
      font-weight: 800;
      opacity: 0;
      pointer-events: none;
      text-align: center;
      transition-property: opacity, transform;
      transition-duration: 180ms;
      transition-timing-function: ease-out;
    }

    .toast.is-visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    @media (max-width: 760px) {
      .file-shell {
        padding: 14px;
      }

      .app-header,
      .title-cluster {
        align-items: stretch;
      }

      .app-header {
        flex-direction: column;
      }

      .header-meta {
        justify-content: flex-start;
      }

      .toolbar {
        grid-template-columns: 1fr auto;
      }

      .action-group {
        min-width: 0;
      }

      .path-form {
        grid-column: 1 / -1;
        grid-row: 2;
      }

      .text-button {
        padding-inline: 12px;
      }

      .entry {
        grid-template-columns: 42px minmax(0, 1fr);
        grid-template-areas:
          "icon name"
          "icon meta";
        min-height: 66px;
      }

      .entry-head {
        display: none;
      }

      .entry-icon { grid-area: icon; }
      .entry-name { grid-area: name; }
      .entry-type {
        grid-area: meta;
      }

      .entry-size,
      .entry-date {
        display: none;
      }

      .file-shell[data-view="grid"] .entries {
        grid-template-columns: repeat(auto-fill, minmax(146px, 1fr));
      }
    }
  </style>`
}

function renderBridgeScript({ currentPath, parentHref }) {
  const payload = jsonForScript({ bridgePath: LOCAL_FILE_BRIDGE_PATH, currentPath, parentHref, viewStorageKey })

  return `<script>
    (() => {
      const state = ${payload};
      const root = document.documentElement;
      const shell = document.querySelector('[data-file-shell]');
      const toast = document.querySelector('[data-toast]');
      const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      const showToast = (message) => {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('is-visible');
        window.clearTimeout(showToast.timer);
        showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 1700);
      };

      const hexToHsl = (hex) => {
        const match = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex || '');
        if (!match) return [188, 87, 36];
        let r = parseInt(match[1], 16) / 255;
        let g = parseInt(match[2], 16) / 255;
        let b = parseInt(match[3], 16) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0;
        let s = 0;
        const l = (max + min) / 2;
        if (max !== min) {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
          if (max === g) h = (b - r) / d + 2;
          if (max === b) h = (r - g) / d + 4;
          h /= 6;
        }
        return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
      };

      const readJson = (key) => {
        try {
          const raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      };

      const applyStoredTheme = () => {
        const master = readJson('bihs_master_config_v1');
        const legacyTheme = readJson('bihs_theme_data');
        const theme = master?.theme || legacyTheme || {};
        const primaryColor = theme.primaryColor || '#0891b2';
        const [h, s, l] = hexToHsl(primaryColor);
        root.style.setProperty('--color-primary-h', String(h));
        root.style.setProperty('--color-primary-s', s + '%');
        root.style.setProperty('--color-primary-l', l + '%');
        root.style.setProperty('--color-primary', h + ' ' + s + '% ' + l + '%');
        root.style.setProperty('--color-primary-hex', primaryColor);

        const storedAdmin = localStorage.getItem('bihs_admin_display_mode');
        const storedUser = localStorage.getItem('bihs_user_display_mode');
        const configured = theme.displayMode === 'light' || theme.displayMode === 'dark' ? theme.displayMode : '';
        const mode = storedAdmin || storedUser || configured || 'dark';
        root.classList.toggle('light', mode === 'light');
      };

      const setView = (view) => {
        const nextView = view === 'grid' ? 'grid' : 'list';
        shell.dataset.view = nextView;
        document.querySelectorAll('[data-view-button]').forEach((button) => {
          button.setAttribute('aria-pressed', String(button.dataset.viewButton === nextView));
        });
        try {
          localStorage.setItem(state.viewStorageKey, nextView);
        } catch {
          // Ignore private-mode storage failures.
        }
      };

      applyStoredTheme();
      const savedView = (() => {
        try {
          return localStorage.getItem(state.viewStorageKey);
        } catch {
          return 'grid';
        }
      })();
      setView(savedView === 'list' ? 'list' : 'grid');

      document.querySelectorAll('[data-view-button]').forEach((button) => {
        button.addEventListener('click', () => setView(button.dataset.viewButton));
      });

      const iconMarkup = {
        archive: '${renderIcon('archive')}',
        audio: '${renderIcon('audio')}',
        code: '${renderIcon('code')}',
        document: '${renderIcon('document')}',
        file: '${renderIcon('file')}',
        folder: '${renderIcon('folder')}',
        image: '${renderIcon('image')}',
        pdf: '${renderIcon('pdf')}',
        presentation: '${renderIcon('presentation')}',
        sheet: '${renderIcon('sheet')}',
        text: '${renderIcon('text')}',
        video: '${renderIcon('video')}',
      };

      const searchCluster = document.querySelector('[data-search]');
      const searchToggle = document.querySelector('[data-action="search-toggle"]');
      const searchDrawer = document.querySelector('.search-drawer');
      const searchInput = document.querySelector('[data-search-input]');
      const searchResults = document.querySelector('[data-search-results]');
      let searchTimer = 0;
      let searchController = null;

      const setSearchResults = (html, hidden = false) => {
        if (!searchResults) return;
        searchResults.innerHTML = html;
        searchResults.hidden = hidden;
      };

      const openSearch = () => {
        searchCluster?.classList.add('is-open');
        searchToggle?.setAttribute('aria-expanded', 'true');
        searchDrawer?.setAttribute('aria-hidden', 'false');
        window.setTimeout(() => searchInput?.focus(), 40);
      };

      const closeSearch = () => {
        searchCluster?.classList.remove('is-open');
        searchToggle?.setAttribute('aria-expanded', 'false');
        searchDrawer?.setAttribute('aria-hidden', 'true');
        setSearchResults('', true);
        if (searchInput) searchInput.value = '';
        if (searchController) searchController.abort();
      };

      const renderSearchItem = (item, index) => {
        const targetAttrs = item.isDirectory ? '' : ' target="_blank" rel="noopener" data-open-file="true"';
        const icon = iconMarkup[item.kind] || iconMarkup.file;
        const pathLabel = item.relativePath || item.fullPath || '';
        return '<a class="search-result" style="--result-index: ' + index + '" href="' + escapeHtml(item.href) + '"' + targetAttrs + ' title="' + escapeHtml(item.fullPath) + '">' +
          '<span class="search-result-icon">' + icon + '</span>' +
          '<span class="search-result-main">' +
            '<span class="search-result-name" dir="auto">' + escapeHtml(item.name) + '</span>' +
            '<span class="search-result-path" dir="ltr">' + escapeHtml(pathLabel) + '</span>' +
          '</span>' +
          '<span class="search-result-tag">' + escapeHtml(item.label || '') + '</span>' +
        '</a>';
      };

      const renderSearchResults = (data) => {
        const results = Array.isArray(data?.results) ? data.results : [];
        if (!results.length) {
          setSearchResults('<div class="search-empty">לא נמצאו תוצאות בתיקייה הנוכחית.</div>');
          return;
        }

        const suffix = data.truncated ? ' · מוצגות התוצאות הראשונות' : '';
        const meta = '<div class="search-meta"><span>' + results.length + ' תוצאות' + suffix + '</span><span>' + escapeHtml(data.query || '') + '</span></div>';
        setSearchResults(meta + '<div class="search-list">' + results.map(renderSearchItem).join('') + '</div>');
      };

      const runSearch = async () => {
        const query = searchInput?.value.trim() || '';
        if (!query) {
          setSearchResults('<div class="search-status">הקלד שם קובץ או תיקייה לחיפוש בתוך הנתיב הנוכחי.</div>');
          return;
        }

        if (searchController) searchController.abort();
        searchController = new AbortController();
        setSearchResults('<div class="search-status">מחפש...</div>');

        try {
          const url = new URL(state.bridgePath, window.location.origin);
          url.searchParams.set('search', '1');
          url.searchParams.set('path', state.currentPath);
          url.searchParams.set('q', query);
          const response = await fetch(url.href, { headers: { Accept: 'application/json' }, signal: searchController.signal });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error || 'Search failed');
          renderSearchResults(data);
        } catch (error) {
          if (error.name === 'AbortError') return;
          setSearchResults('<div class="search-empty">החיפוש נכשל: ' + escapeHtml(error.message) + '</div>');
        }
      };

      searchToggle?.addEventListener('click', () => {
        if (searchCluster?.classList.contains('is-open')) {
          closeSearch();
          return;
        }
        openSearch();
        setSearchResults('<div class="search-status">הקלד שם קובץ או תיקייה לחיפוש בתוך הנתיב הנוכחי.</div>');
      });

      searchInput?.addEventListener('input', () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(runSearch, 260);
      });

      searchInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeSearch();
        }
      });

      document.addEventListener('click', (event) => {
        if (!searchCluster?.classList.contains('is-open')) return;
        if (searchCluster.contains(event.target)) return;
        closeSearch();
      });

      const pathInput = document.querySelector('#path-input');
      const pathForm = document.querySelector('.path-form');
      pathInput?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        pathForm?.requestSubmit();
      });

      document.addEventListener('click', (event) => {
        const link = event.target?.closest?.('a[data-open-file="true"]');
        if (!link) return;
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const opened = window.open(link.href, '_blank');
        if (opened) {
          opened.opener = null;
        } else {
          showToast('הדפדפן חסם פתיחת טאב חדש');
        }
      });

      document.querySelector('[data-action="back"]')?.addEventListener('click', () => {
        if (window.history.length > 1) {
          window.history.back();
          return;
        }
        if (state.parentHref) window.location.href = state.parentHref;
      });

      document.querySelector('[data-action="refresh"]')?.addEventListener('click', () => {
        window.location.reload();
      });

      document.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(state.currentPath);
          showToast('הנתיב הועתק');
        } catch {
          showToast('לא ניתן להעתיק כרגע');
        }
      });
    })();
  </script>`
}

export function renderDirectoryPage(model) {
  const parentButton = model.parentHref
    ? `<a class="icon-button" href="${htmlEscape(model.parentHref)}" title="לתיקיית האב" aria-label="לתיקיית האב">${renderIcon('up')}</a>`
    : `<span class="icon-button" aria-disabled="true" title="אין תיקיית אב" aria-label="אין תיקיית אב">${renderIcon('up')}</span>`

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${htmlEscape(model.currentPath)}</title>
  ${renderBridgeStyles()}
</head>
<body>
  <div class="file-shell" data-file-shell data-view="grid">
    <div class="app-frame">
      <header class="app-header">
        <div class="title-cluster">
          <span class="brand-mark">${renderIcon('folder')}</span>
          <div>
            <p class="eyebrow">מתנ״ה - תיקיות רשת</p>
            <h1>מנהל קבצים בתיקיות הרשת</h1>
          </div>
        </div>
        <div class="header-meta">
          <span>${htmlEscape(model.itemCount)} פריטים</span>
        </div>
      </header>

      <nav class="toolbar" aria-label="פעולות תיקייה">
        <span class="action-group">
          <span class="search-cluster" data-search>
            <button class="icon-button search-toggle" type="button" data-action="search-toggle" aria-expanded="false" title="חיפוש בתיקייה הנוכחית" aria-label="חיפוש בתיקייה הנוכחית">${renderIcon('search')}</button>
            <span class="search-drawer" aria-hidden="true">
              <input class="search-input" data-search-input type="search" placeholder="חיפוש בתיקייה הנוכחית..." autocomplete="off" spellcheck="false" />
            </span>
            <div class="search-results" data-search-results hidden></div>
          </span>
          <button class="icon-button" type="button" data-action="back" title="חזור" aria-label="חזור">${renderIcon('back')}</button>
          ${parentButton}
          <button class="icon-button" type="button" data-action="refresh" title="רענון" aria-label="רענון">${renderIcon('refresh')}</button>
          <button class="icon-button" type="button" data-action="copy" title="העתק נתיב" aria-label="העתק נתיב">${renderIcon('copy')}</button>
        </span>
        <form class="path-form" action="${LOCAL_FILE_BRIDGE_PATH}" method="get">
          <label class="path-label" for="path-input">נתיב רשת</label>
          <input id="path-input" class="path-input" name="path" value="${htmlEscape(model.currentPath)}" autocomplete="off" spellcheck="false" />
          <input type="hidden" name="base" value="${htmlEscape(model.currentPath)}" />
          <button class="text-button" type="submit">עבור</button>
        </form>
        <span class="view-toggle" role="group" aria-label="מצב תצוגה">
          <button class="view-button" type="button" data-view-button="grid" aria-pressed="true" title="תצוגת קוביות" aria-label="תצוגת קוביות">${renderIcon('grid')}</button>
          <button class="view-button" type="button" data-view-button="list" aria-pressed="false" title="תצוגת שורות" aria-label="תצוגת שורות">${renderIcon('list')}</button>
        </span>
      </nav>

      <nav class="breadcrumbs" aria-label="נתיב תיקייה">
        ${renderBreadcrumbs(model.breadcrumbs)}
      </nav>

      <main class="content-panel">
        ${renderDirectoryEntries(model.entries)}
      </main>
    </div>
  </div>
  <div class="toast" data-toast role="status" aria-live="polite"></div>
  ${renderBridgeScript({ currentPath: model.currentPath, parentHref: model.parentHref })}
</body>
</html>`
}

export function renderBridgeErrorPage({ statusCode = 404, title = 'לא ניתן לפתוח את הנתיב', message = '', attemptedPath = '', parentHref = '' } = {}) {
  const parentAction = parentHref
    ? `<a class="text-button" href="${htmlEscape(parentHref)}">לתיקיית האב</a>`
    : ''

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${htmlEscape(title)}</title>
  ${renderBridgeStyles()}
</head>
<body>
  <div class="file-shell" data-file-shell data-view="grid">
    <div class="app-frame">
      <div class="error-state">
        <div>
          <div class="empty-icon">${renderIcon('file')}</div>
          <h1>${htmlEscape(title)}</h1>
          <p>${htmlEscape(message || `שגיאה ${statusCode}`)}</p>
          ${attemptedPath ? `<p class="path-input" dir="ltr">${htmlEscape(attemptedPath)}</p>` : ''}
          <div class="error-actions">
            <button class="text-button" type="button" onclick="history.back()">חזור</button>
            ${parentAction}
          </div>
        </div>
      </div>
    </div>
  </div>
  ${renderBridgeScript({ currentPath: attemptedPath, parentHref })}
</body>
</html>`
}

export function localFileBridgePlugin() {
  return {
    name: 'sitebuilder-local-file-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(LOCAL_FILE_BRIDGE_PATH, (req, res) => {
        let attemptedPath = ''

        try {
          const requestUrl = new URL(req.url || '/', 'http://localhost')
          const isSearchRequest = requestUrl.searchParams.get('search') === '1'

          if (isSearchRequest) {
            try {
              const rootPathInput = requestUrl.searchParams.get('path') || ''
              const hrefInput = requestUrl.searchParams.get('href') || ''
              const query = requestUrl.searchParams.get('q') || ''
              const rootHref = rootPathInput ? fileHrefFromUserPath(rootPathInput) : hrefInput
              const filePath = filePathFromHref(rootHref)
              attemptedPath = filePath || rootPathInput || hrefInput

              if (!filePath) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json; charset=utf-8')
                res.end(JSON.stringify({ error: 'Unsupported search path' }))
                return
              }

              const stat = fs.statSync(filePath)
              if (!stat.isDirectory()) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json; charset=utf-8')
                res.end(JSON.stringify({ error: 'Search path is not a directory' }))
                return
              }

              const model = searchDirectoryModel(filePath, query)
              res.setHeader('Cache-Control', 'no-store')
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(model))
            } catch (error) {
              res.statusCode = 404
              res.setHeader('Cache-Control', 'no-store')
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify({ error: error.message, rootPath: attemptedPath }))
            }
            return
          }

          const typedPath = requestUrl.searchParams.get('path')

          if (typedPath) {
            const basePath = requestUrl.searchParams.get('base') || ''
            const nextHref = fileHrefFromUserPath(typedPath, basePath)
            if (!nextHref) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'text/html; charset=utf-8')
              res.end(renderBridgeErrorPage({
                statusCode: 400,
                title: 'הנתיב שהוזן לא נתמך',
                message: 'אפשר להזין נתיב מקומי, נתיב רשת או file URL תקין.',
                attemptedPath: typedPath,
              }))
              return
            }

            res.statusCode = 302
            res.setHeader('Location', bridgeHrefFromFileHref(nextHref))
            res.end()
            return
          }

          const href = requestUrl.searchParams.get('href') || ''
          const filePath = filePathFromHref(href)
          attemptedPath = filePath || href
          if (!filePath) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(renderBridgeErrorPage({
              statusCode: 400,
              title: 'כתובת הקובץ לא נתמכת',
              message: 'ה־bridge המקומי יודע לפתוח רק כתובות file מקומיות.',
              attemptedPath: href,
            }))
            return
          }

          const stat = fs.statSync(filePath)
          if (stat.isDirectory()) {
            const model = readDirectoryModel(filePath)
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(renderDirectoryPage(model))
            return
          }

          res.setHeader('Content-Type', contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream')
          fs.createReadStream(filePath).pipe(res)
        } catch (error) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(renderBridgeErrorPage({
            statusCode: 404,
            title: 'לא ניתן לפתוח את הנתיב',
            message: error.message,
            attemptedPath,
            parentHref: attemptedPath ? getParentHref(attemptedPath) : '',
          }))
        }
      })
    },
  }
}
