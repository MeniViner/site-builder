import fs from 'fs'
import os from 'os'
import path from 'path'
import process from 'process'
import { spawn } from 'child_process'
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

const viewStorageKey = 'sitebuilder.localFileBridge.view.v4'
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

export function getDefaultOpenCommand(filePath, platform = process.platform) {
  const value = String(filePath || '').trim()
  if (!value) return null

  if (platform === 'darwin') {
    return { command: 'open', args: [value], options: { detached: true, stdio: 'ignore' } }
  }

  if (platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/c', 'start', '', value],
      options: { detached: true, stdio: 'ignore', windowsHide: true },
    }
  }

  return { command: 'xdg-open', args: [value], options: { detached: true, stdio: 'ignore' } }
}

export function openPathInDefaultApplication(filePath, platform = process.platform) {
  const openCommand = getDefaultOpenCommand(filePath, platform)
  if (!openCommand) throw new Error('Missing file path')

  const child = spawn(openCommand.command, openCommand.args, openCommand.options)
  child.unref()
  return openCommand
}

function isAuthorizedNativeOpenRequest(req) {
  return req.method === 'POST' && req.headers['x-sitebuilder-local-open'] === '1'
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
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
    computer: `<svg ${shared}><rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>`,
    desktop: `<svg ${shared}><rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M7 20h10"/></svg>`,
    download: `<svg ${shared}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
    folder: `<svg aria-hidden="true" class="icon folder-icon" viewBox="0 0 48 48"><path fill="#D99A00" d="M3.5 11.2A4.2 4.2 0 0 1 7.7 7h11.1l4.7 4.7h16.8a4.2 4.2 0 0 1 4.2 4.2v21.2a4.2 4.2 0 0 1-4.2 4.2H7.7a4.2 4.2 0 0 1-4.2-4.2Z"/><path fill="#FFD35A" d="M3.5 16.5h41v20.6a4.2 4.2 0 0 1-4.2 4.2H7.7a4.2 4.2 0 0 1-4.2-4.2Z"/><path fill="#FFE58B" d="M7.7 17.8h32.6c1 0 1.8.8 1.8 1.8v1.2H5.9v-1.2c0-1 .8-1.8 1.8-1.8Z"/></svg>`,
    grid: `<svg ${shared}><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
    home: `<svg ${shared}><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>`,
    image: `<svg ${shared}><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>`,
    list: `<svg ${shared}><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>`,
    openApp: `<svg ${shared}><path d="M15 3h6v6"/><path d="m10 14 11-11"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>`,
    pdf: `<svg ${shared}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 17v-4h1.5a1.5 1.5 0 0 1 0 3H8"/><path d="M13 13v4h1a2 2 0 0 0 0-4Z"/><path d="M18 13h-2v4"/><path d="M16 15h2"/></svg>`,
    presentation: `<svg ${shared}><path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/></svg>`,
    refresh: `<svg ${shared}><path d="M21 12a9 9 0 0 0-9-9 9.8 9.8 0 0 0-6.7 2.7L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.8 9.8 0 0 0 6.7-2.7L21 16"/><path d="M16 16h5v5"/></svg>`,
    network: `<svg ${shared}><rect x="8" y="3" width="8" height="6" rx="1"/><rect x="2" y="15" width="8" height="6" rx="1"/><rect x="14" y="15" width="8" height="6" rx="1"/><path d="M12 9v3M6 15v-3h12v3"/></svg>`,
    search: `<svg ${shared}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
    sheet: `<svg ${shared}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M11 9v12"/></svg>`,
    text: `<svg ${shared}><path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/></svg>`,
    up: `<svg ${shared}><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`,
    video: `<svg ${shared}><path d="m16 13 5.2 3.1a.5.5 0 0 0 .8-.4V8.3a.5.5 0 0 0-.8-.4L16 11"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>`,
  }

  return icons[name] || icons.file
}

function isSameOrChildPath(candidatePath, currentPath, platform = process.platform) {
  const pathApi = toPathApi(platform)
  const relative = pathApi.relative(pathApi.resolve(candidatePath), pathApi.resolve(currentPath))
  return relative === '' || (!relative.startsWith('..') && !pathApi.isAbsolute(relative))
}

function renderNavigationPane(currentPath, platform = process.platform, hrefForPath = bridgeHrefFromPath) {
  const pathApi = toPathApi(platform)
  const homePath = os.homedir()
  const parsed = pathApi.parse(pathApi.resolve(currentPath))
  const candidates = [
    { icon: 'home', label: 'בית', targetPath: homePath },
    { icon: 'desktop', label: 'שולחן העבודה', targetPath: pathApi.join(homePath, 'Desktop') },
    { icon: 'document', label: 'מסמכים', targetPath: pathApi.join(homePath, 'Documents') },
    { icon: 'download', label: 'הורדות', targetPath: pathApi.join(homePath, 'Downloads') },
  ].filter((item, index, items) => item.targetPath && fs.existsSync(item.targetPath)
    && items.findIndex((candidate) => candidate.targetPath === item.targetPath) === index)
  const activePath = candidates
    .filter((item) => isSameOrChildPath(item.targetPath, currentPath, platform))
    .sort((a, b) => b.targetPath.length - a.targetPath.length)[0]?.targetPath

  const quickLinks = candidates.map((item) => {
    const isActive = item.targetPath === activePath
    const href = hrefForPath(item.targetPath, platform)
    if (!href) return ''
    return `<a class="navigation-link${isActive ? ' is-active' : ''}" href="${htmlEscape(href)}" title="${htmlEscape(item.targetPath)}"${isActive ? ' aria-current="location"' : ''}>
      <span class="navigation-icon">${renderIcon(item.icon)}</span>
      <span class="navigation-label">${htmlEscape(item.label)}</span>
    </a>`
  }).filter(Boolean).join('\n')

  const rootPath = parsed.root || currentPath
  const rootLabel = platform === 'win32' ? (parsed.root || 'מחשב זה') : 'מערכת הקבצים'

  const rootHref = hrefForPath(rootPath, platform)
  const rootLink = rootHref
    ? `<a class="navigation-link" href="${htmlEscape(rootHref)}" title="${htmlEscape(rootPath)}">
        <span class="navigation-icon navigation-icon-computer">${renderIcon('computer')}</span>
        <span class="navigation-label">${htmlEscape(rootLabel)}</span>
      </a>`
    : ''

  return `<aside class="navigation-pane" aria-label="ניווט בתיקיות">
    <div class="navigation-section">
      <p class="navigation-heading">גישה מהירה</p>
      ${quickLinks}
    </div>
    <div class="navigation-section">
      <p class="navigation-heading">מיקומים</p>
      ${rootLink}
      <span class="navigation-link is-current-location${activePath ? '' : ' is-active'}" title="${htmlEscape(currentPath)}">
        <span class="navigation-icon">${renderIcon('network')}</span>
        <span class="navigation-label">המיקום הנוכחי</span>
      </span>
    </div>
  </aside>`
}

function renderBreadcrumbs(breadcrumbs) {
  return breadcrumbs.map((crumb, index) => {
    const isLast = index === breadcrumbs.length - 1
    const content = htmlEscape(crumb.label)
    if (isLast) return `<span class="breadcrumb-current" dir="auto">${content}</span>`
    if (!crumb.href) return `<span class="breadcrumb-current" dir="auto">${content}</span><span class="breadcrumb-separator">/</span>`
    return `<a href="${htmlEscape(crumb.href)}" dir="auto">${content}</a><span class="breadcrumb-separator">/</span>`
  }).join('')
}

function renderEntry(entry, { allowNativeOpen = true } = {}) {
  const href = htmlEscape(entry.href)
  const title = htmlEscape(entry.fullPath)
  const targetAttrs = entry.isDirectory ? '' : ' target="_blank" rel="noopener" data-open-file="true"'
  const disabledClass = entry.isReadable ? '' : ' is-unreadable'
  const dateAttr = entry.modifiedIso ? ` datetime="${htmlEscape(entry.modifiedIso)}"` : ''
  const errorTitle = entry.readError ? ` title="${htmlEscape(entry.readError)}"` : ''
  const nativeAction = allowNativeOpen && !entry.isDirectory && entry.isReadable
    ? `<button class="entry-action" type="button" data-open-native="true" data-path="${title}" title="פתח באפליקציה" aria-label="פתח את ${htmlEscape(entry.name)} באפליקציית ברירת המחדל">${renderIcon('openApp')}</button>`
    : ''

  return `<article class="entry kind-${htmlEscape(entry.kind)}${disabledClass}" role="listitem" data-entry-kind="${htmlEscape(entry.kind)}" title="${title}">
    <a class="entry-main" href="${href}"${targetAttrs}>
      <span class="entry-icon">
        ${renderIcon(entry.kind)}
        ${entry.isDirectory ? '' : `<span class="entry-extension">${htmlEscape(entry.label)}</span>`}
      </span>
      <span class="entry-name" dir="auto">${htmlEscape(entry.name)}</span>
      <span class="entry-type"${errorTitle}>${htmlEscape(entry.label)}</span>
      <span class="entry-size">${htmlEscape(entry.sizeLabel || '')}</span>
      <time class="entry-date"${dateAttr}>${htmlEscape(entry.modifiedLabel)}</time>
    </a>
    ${nativeAction}
  </article>`
}

function renderEmptyState() {
  return `<div class="empty-state">
    <div class="empty-icon">${renderIcon('folder')}</div>
    <h2>התיקייה ריקה</h2>
    <p>אין כאן קבצים או תיקיות להצגה.</p>
  </div>`
}

function renderDirectoryEntries(entries, options = {}) {
  if (!entries.length) return renderEmptyState()

  return `<div class="entries" role="list">
    <div class="entry-head" aria-hidden="true">
      <span></span>
      <span>שם</span>
      <span>סוג</span>
      <span>גודל</span>
      <span>עודכן</span>
    </div>
    ${entries.map((entry) => renderEntry(entry, options)).join('\n')}
  </div>`
}

function renderBridgeStyles() {
  return `<style>
    :root {
      --color-primary-h: 208;
      --color-primary-s: 100%;
      --color-primary-l: 38%;
      --color-primary: var(--color-primary-h) var(--color-primary-s) var(--color-primary-l);
      --color-primary-hex: #0067c0;
      --color-bg-base: #f3f3f3;
      --color-bg-card: #ffffff;
      --color-bg-card-hover: #e5f3ff;
      --color-bg-elevated: #f7f7f7;
      --color-bg-chrome: #f9f9f9;
      --color-border-subtle: rgba(0, 0, 0, 0.08);
      --color-border-strong: rgba(0, 0, 0, 0.16);
      --color-text-primary: #1b1b1b;
      --color-text-muted: #5f6368;
      --shadow-border: 0 0 0 1px rgba(0, 0, 0, 0.08);
      color-scheme: light;
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
      max-width: 100%;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      min-height: 100vh;
      margin: 0;
      background: var(--color-bg-base);
      color: var(--color-text-primary);
      font-family: "Segoe UI", Arial, sans-serif;
      overflow-x: hidden;
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
      max-width: 100%;
      text-align: right;
    }

    .title-cluster > div {
      min-width: 0;
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
      overflow-wrap: anywhere;
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
      border-radius: 8px;
      background: var(--color-bg-card);
      color: var(--color-text-primary);
      box-shadow: var(--shadow-border);
      overflow: hidden;
      position: relative;
      transition-property: background-color, box-shadow, transform;
      transition-duration: 160ms;
      transition-timing-function: ease-out;
    }

    .entry::before {
      content: "";
      position: absolute;
      inset-block: 8px;
      inset-inline-start: 0;
      width: 3px;
      border-radius: 999px;
      background: hsl(var(--color-primary) / 0.88);
      opacity: 0;
      transform: scaleY(0.36);
      transition-property: opacity, transform;
      transition-duration: 160ms;
      transition-timing-function: ease-out;
    }

    .entry:hover {
      background: var(--color-bg-card-hover);
      box-shadow: 0 0 0 1px hsl(var(--color-primary) / 0.24), 0 12px 26px rgba(0, 0, 0, 0.12);
      transform: translateY(-1px);
    }

    .entry:hover::before,
    .entry:focus-within::before {
      opacity: 1;
      transform: scaleY(1);
    }

    .entry:active {
      transform: scale(0.99);
    }

    .entry-main,
    .entry-head {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) minmax(74px, 120px) minmax(72px, 110px) minmax(112px, 150px);
      align-items: center;
      gap: 10px;
      min-height: 54px;
      padding: 7px 54px 7px 12px;
    }

    .entry-main:focus-visible {
      outline: 2px solid hsl(var(--color-primary) / 0.5);
      outline-offset: -3px;
    }

    .entry-head {
      min-height: 36px;
      padding-block: 0;
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
      position: relative;
      border-radius: 8px;
      background: hsl(var(--color-primary) / 0.12);
      color: hsl(var(--color-primary) / 0.96);
    }

    .entry-extension {
      position: absolute;
      inset-block-end: -3px;
      inset-inline-end: -4px;
      min-width: 24px;
      border-radius: 6px;
      background: var(--color-bg-card);
      color: var(--color-text-muted);
      padding: 1px 4px;
      box-shadow: var(--shadow-border);
      font-size: 8px;
      font-weight: 900;
      line-height: 1.4;
      text-align: center;
      text-transform: uppercase;
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
      text-align: right;
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

    .entry-action {
      position: absolute;
      inset-block-start: 50%;
      inset-inline-end: 8px;
      z-index: 2;
      display: inline-flex;
      width: 40px;
      height: 40px;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 8px;
      background: hsl(var(--color-primary) / 0.12);
      color: hsl(var(--color-primary) / 0.96);
      cursor: pointer;
      opacity: 0;
      filter: blur(4px);
      transform: translateY(-50%) scale(0.25);
      transition-property: opacity, filter, transform, background-color, color, box-shadow;
      transition-duration: 180ms;
      transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
    }

    .entry:hover .entry-action,
    .entry:focus-within .entry-action {
      opacity: 1;
      filter: blur(0);
      transform: translateY(-50%) scale(1);
    }

    .entry-action:hover {
      background: hsl(var(--color-primary) / 0.95);
      color: white;
      box-shadow: 0 8px 18px hsl(var(--color-primary) / 0.22);
    }

    .entry-action:active {
      transform: translateY(-50%) scale(0.96);
    }

    .entry-action:focus-visible {
      outline: 2px solid hsl(var(--color-primary) / 0.5);
      outline-offset: 2px;
      opacity: 1;
      filter: blur(0);
      transform: translateY(-50%) scale(1);
    }

    .entry-action.is-busy {
      cursor: wait;
      opacity: 0.7;
    }

    .entry-action:disabled {
      pointer-events: none;
    }

    .is-unreadable {
      opacity: 0.58;
    }

    .file-shell[data-view="grid"] .entries {
      grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
      gap: 12px;
    }

    .file-shell[data-view="grid"] .entry-head {
      display: none;
    }

    .file-shell[data-view="grid"] .entry {
      min-height: 176px;
    }

    .file-shell[data-view="grid"] .entry::before {
      inset: 0 10px auto;
      width: auto;
      height: 3px;
      transform: scaleX(0.28);
    }

    .file-shell[data-view="grid"] .entry:hover::before,
    .file-shell[data-view="grid"] .entry:focus-within::before {
      transform: scaleX(1);
    }

    .file-shell[data-view="grid"] .entry-main {
      grid-template-columns: 1fr;
      align-content: start;
      gap: 8px;
      min-height: 176px;
      padding: 15px;
    }

    .file-shell[data-view="grid"] .entry-icon {
      width: 62px;
      height: 58px;
      margin-bottom: 2px;
    }

    .file-shell[data-view="grid"] .entry-name {
      white-space: normal;
      line-height: 1.28;
      text-wrap: pretty;
    }

    .file-shell[data-view="grid"] .entry-type,
    .file-shell[data-view="grid"] .entry-size,
    .file-shell[data-view="grid"] .entry-date {
      justify-self: start;
      text-align: right;
    }

    .file-shell[data-view="grid"] .entry-type {
      border-radius: 6px;
      background: hsl(var(--color-primary) / 0.1);
      color: hsl(var(--color-primary) / 0.96);
      padding: 2px 7px;
      box-shadow: var(--shadow-border);
    }

    .file-shell[data-view="grid"] .entry-action {
      inset-block-start: 10px;
      inset-inline-end: 10px;
      opacity: 0.84;
      filter: blur(0);
      transform: scale(1);
    }

    .file-shell[data-view="grid"] .entry-action:active {
      transform: scale(0.96);
    }

    .file-shell[data-view="grid"] .entry-action:focus-visible {
      transform: scale(1);
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
        width: 100%;
        max-width: 100vw;
        overflow-x: hidden;
      }

      .app-frame {
        max-width: 100%;
        overflow-x: hidden;
      }

      .app-header,
      .title-cluster {
        align-items: stretch;
      }

      .app-header {
        flex-direction: column;
        overflow: hidden;
      }

      .title-cluster {
        width: 100%;
        gap: 10px;
      }

      .title-cluster > div {
        width: min(100%, calc(100vw - 82px));
      }

      .brand-mark {
        width: 44px;
        height: 44px;
      }

      h1 {
        font-size: 30px;
        line-height: 1.12;
      }

      .header-meta {
        justify-content: flex-start;
      }

      .toolbar {
        grid-template-columns: minmax(0, 1fr);
        gap: 8px;
        padding: 8px;
      }

      .action-group {
        width: 100%;
        min-width: 0;
        justify-content: flex-end;
        gap: 4px;
        overflow-x: auto;
        padding-block: 2px;
        scrollbar-width: none;
      }

      .action-group::-webkit-scrollbar {
        display: none;
      }

      .path-form {
        grid-column: 1 / -1;
        grid-row: auto;
      }

      .view-toggle {
        justify-self: start;
      }

      .text-button {
        padding-inline: 12px;
      }

      .entry-main {
        grid-template-columns: 42px minmax(0, 1fr);
        grid-template-areas:
          "icon name"
          "icon meta";
        min-height: 66px;
        padding-inline-end: 54px;
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
        grid-template-columns: repeat(2, minmax(0, 1fr));
        width: 100%;
        max-width: 100%;
      }

      .file-shell[data-view="grid"] .entry-main {
        min-height: 164px;
      }
    }

    /* Solid Windows File Explorer-inspired presentation. */
    :root,
    :root.light {
      --color-primary-h: 208;
      --color-primary-s: 100%;
      --color-primary-l: 38%;
      --color-primary: var(--color-primary-h) var(--color-primary-s) var(--color-primary-l);
      --color-primary-hex: #0067c0;
      --color-bg-base: #f3f3f3;
      --color-bg-card: #ffffff;
      --color-bg-card-hover: #e5f3ff;
      --color-bg-elevated: #f7f7f7;
      --color-bg-chrome: #f9f9f9;
      --color-border-subtle: rgba(0, 0, 0, 0.08);
      --color-border-strong: rgba(0, 0, 0, 0.16);
      --color-text-primary: #1b1b1b;
      --color-text-muted: #5f6368;
      --shadow-border: 0 0 0 1px rgba(0, 0, 0, 0.08);
      color-scheme: light;
    }

    body {
      background: #ffffff;
      color: var(--color-text-primary);
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 13px;
    }

    .file-shell {
      min-height: 100vh;
      padding: 0;
      background: #ffffff;
    }

    .app-frame {
      width: 100%;
      max-width: none;
      margin: 0;
      background: #ffffff;
    }

    .app-header {
      min-height: 54px;
      margin: 0;
      padding: 8px 14px;
      border-bottom: 1px solid #dddddd;
      background: #f3f3f3;
    }

    .title-cluster {
      gap: 10px;
    }

    .brand-mark,
    .empty-icon {
      width: 34px;
      height: 34px;
      border-radius: 3px;
      background: transparent;
      color: #d99500;
      box-shadow: none;
    }

    .brand-mark .icon,
    .empty-icon .icon {
      width: 24px;
      height: 24px;
    }

    .eyebrow {
      margin: 0 0 1px;
      color: var(--color-text-muted);
      font-size: 11px;
      font-weight: 400;
    }

    h1 {
      font-size: 18px;
      font-weight: 600;
      line-height: 1.25;
      letter-spacing: 0;
    }

    .header-meta {
      min-height: 32px;
      padding-inline: 8px;
      color: var(--color-text-muted);
      font-size: 12px;
      font-weight: 400;
    }

    .toolbar {
      grid-template-columns: auto minmax(280px, 1fr) auto;
      gap: 8px;
      margin: 0;
      padding: 6px 10px;
      border-radius: 0;
      border-bottom: 1px solid #dddddd;
      background: #f9f9f9;
      box-shadow: none;
      backdrop-filter: none;
    }

    .action-group {
      gap: 2px;
    }

    .icon-button,
    .text-button,
    .view-button {
      min-width: 40px;
      height: 40px;
      border: 1px solid transparent;
      border-radius: 4px;
      background: transparent;
      color: #303030;
      transition-property: background-color, border-color, color, transform;
      transition-duration: 120ms;
      transition-timing-function: ease-out;
    }

    .icon-button:hover,
    .text-button:hover,
    .view-button:hover {
      border-color: #cce8ff;
      background: #e5f3ff;
      color: #1b1b1b;
    }

    .icon-button:focus-visible,
    .text-button:focus-visible,
    .view-button:focus-visible,
    .path-input:focus-visible,
    .search-input:focus-visible {
      outline: 2px solid #0067c0;
      outline-offset: -2px;
    }

    .text-button {
      min-width: 64px;
      padding-inline: 14px;
      border-color: #d0d0d0;
      background: #f5f5f5;
      color: #1b1b1b;
      font-size: 12px;
      font-weight: 600;
    }

    .text-button:hover {
      border-color: #b8d9f2;
      background: #e5f3ff;
    }

    .search-cluster.is-open .search-toggle {
      border-color: #99d1ff;
      background: #d6eaff;
      color: #005a9e;
      box-shadow: none;
    }

    .search-drawer {
      height: 40px;
      opacity: 0;
      filter: none;
      transform: translateX(8px);
      transition-property: opacity, transform;
      transition-duration: 140ms;
    }

    .search-cluster.is-open .search-drawer {
      opacity: 1;
      filter: none;
      transform: translateX(0);
    }

    .search-input {
      border: 1px solid #bfbfbf;
      border-radius: 3px;
      background: #ffffff;
      color: #1b1b1b;
      font-size: 12px;
      font-weight: 400;
      box-shadow: none;
    }

    .search-results {
      border: 1px solid #cfcfcf;
      border-radius: 4px;
      background: #ffffff;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
      filter: none;
      transform: translateY(5px);
      transition-property: opacity, transform;
      transition-duration: 140ms;
    }

    .search-cluster.is-open .search-results:not([hidden]) {
      filter: none;
      transform: translateY(0);
    }

    .search-meta {
      padding: 9px 10px;
      border-bottom-color: #e5e5e5;
      background: #f7f7f7;
      font-size: 11px;
      font-weight: 400;
    }

    .search-list {
      gap: 0;
      padding: 4px;
    }

    .search-result {
      min-height: 48px;
      border-radius: 3px;
      padding: 5px 7px;
      background: transparent;
      opacity: 1;
      filter: none;
      transform: none;
      animation: none;
      transition-property: background-color, box-shadow;
      transition-duration: 120ms;
    }

    .search-result:hover {
      background: #e5f3ff;
      box-shadow: inset 0 0 0 1px #cce8ff;
      transform: none;
    }

    .search-result-icon {
      border-radius: 2px;
      background: transparent;
      color: #d99500;
    }

    .search-result-name {
      font-size: 13px;
      font-weight: 400;
    }

    .search-result-path,
    .search-result-tag,
    .search-status,
    .search-empty {
      font-weight: 400;
    }

    .view-toggle {
      gap: 1px;
      padding: 0;
      border-radius: 0;
      background: transparent;
    }

    .view-button[aria-pressed="true"] {
      border-color: #99d1ff;
      background: #d6eaff;
      color: #005a9e;
      box-shadow: none;
    }

    .path-form {
      gap: 6px;
      border-radius: 0;
    }

    .path-input {
      height: 38px;
      border: 1px solid #bfbfbf;
      border-radius: 2px;
      background: #ffffff;
      color: #1b1b1b;
      padding-inline: 10px;
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 12px;
      font-weight: 400;
    }

    .breadcrumbs {
      min-height: 36px;
      margin: 0;
      padding: 2px 14px;
      border-bottom: 1px solid #e5e5e5;
      background: #ffffff;
      color: var(--color-text-muted);
      font-size: 12px;
      font-weight: 400;
    }

    .breadcrumbs a {
      min-height: 30px;
      border-radius: 3px;
      padding-inline: 7px;
    }

    .breadcrumbs a:hover {
      background: #e5f3ff;
      color: #1b1b1b;
    }

    .content-panel {
      min-height: calc(100vh - 140px);
      padding: 8px 12px 16px;
      background: #ffffff;
    }

    .entries {
      gap: 0;
    }

    .entry {
      border-radius: 0;
      border-bottom: 1px solid #ededed;
      background: transparent;
      box-shadow: none;
      overflow: visible;
      transition-property: background-color, box-shadow;
      transition-duration: 100ms;
    }

    .entry::before {
      content: none;
    }

    .entry:hover,
    .entry:focus-within {
      background: #e5f3ff;
      box-shadow: inset 0 0 0 1px #cce8ff;
      transform: none;
    }

    .entry:active {
      transform: none;
    }

    .entry-main,
    .entry-head {
      grid-template-columns: 38px minmax(0, 1fr) minmax(74px, 120px) minmax(72px, 110px) minmax(112px, 150px);
      gap: 8px;
      min-height: 42px;
      padding: 4px 48px 4px 8px;
    }

    .entry-main:focus-visible {
      outline: 2px solid #0067c0;
      outline-offset: -2px;
    }

    .entry-head {
      min-height: 32px;
      border-bottom: 1px solid #d9d9d9;
      background: #f7f7f7;
      color: #505050;
      font-size: 11px;
      font-weight: 400;
    }

    .entry-icon {
      width: 32px;
      height: 32px;
      border-radius: 0;
      background: transparent;
      color: #d99500;
    }

    .entry-extension {
      inset-block-end: -1px;
      inset-inline-end: -3px;
      min-width: 22px;
      border-radius: 2px;
      background: #ffffff;
      color: #505050;
      padding: 0 3px;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
      font-size: 7px;
      font-weight: 600;
    }

    .kind-file .entry-icon,
    .kind-text .entry-icon,
    .kind-code .entry-icon {
      background: transparent;
      color: #6c7a89;
    }

    .kind-pdf .entry-icon {
      background: transparent;
      color: #c42b1c;
    }

    .kind-image .entry-icon,
    .kind-video .entry-icon {
      background: transparent;
      color: #107c10;
    }

    .kind-sheet .entry-icon {
      background: transparent;
      color: #107c41;
    }

    .kind-presentation .entry-icon {
      background: transparent;
      color: #d24726;
    }

    .entry-name {
      font-size: 13px;
      font-weight: 400;
    }

    .entry-type,
    .entry-size,
    .entry-date {
      color: #5f6368;
      font-size: 12px;
      font-weight: 400;
    }

    .entry-action {
      inset-inline-end: 2px;
      border: 1px solid transparent;
      border-radius: 4px;
      background: transparent;
      color: #303030;
      box-shadow: none;
      transition-property: opacity, filter, transform, background-color, border-color, color;
      transition-duration: 140ms;
    }

    .entry-action:hover {
      border-color: #99d1ff;
      background: #d6eaff;
      color: #005a9e;
      box-shadow: none;
    }

    .entry-action:focus-visible {
      outline-color: #0067c0;
      outline-offset: -2px;
    }

    .file-shell[data-view="grid"] .entries {
      grid-template-columns: repeat(auto-fill, minmax(142px, 1fr));
      gap: 4px;
      padding-top: 4px;
    }

    .file-shell[data-view="grid"] .entry {
      min-height: 132px;
      border: 1px solid transparent;
      border-radius: 4px;
    }

    .file-shell[data-view="grid"] .entry:hover,
    .file-shell[data-view="grid"] .entry:focus-within {
      border-color: #99d1ff;
      background: #e5f3ff;
      box-shadow: none;
    }

    .file-shell[data-view="grid"] .entry-main {
      min-height: 132px;
      align-content: center;
      justify-items: center;
      gap: 7px;
      padding: 10px;
      text-align: center;
    }

    .file-shell[data-view="grid"] .entry-icon {
      width: 54px;
      height: 54px;
      margin: 0;
    }

    .file-shell[data-view="grid"] .entry-icon .icon {
      width: 36px;
      height: 36px;
    }

    .file-shell[data-view="grid"] .entry-name {
      width: 100%;
      text-align: center;
      font-size: 13px;
      font-weight: 400;
    }

    .file-shell[data-view="grid"] .entry-type,
    .file-shell[data-view="grid"] .entry-size,
    .file-shell[data-view="grid"] .entry-date {
      display: none;
    }

    .file-shell[data-view="grid"] .entry-action {
      inset-block-start: 2px;
      inset-inline-end: 2px;
      opacity: 0;
      filter: blur(4px);
      transform: scale(0.25);
    }

    .file-shell[data-view="grid"] .entry:hover .entry-action,
    .file-shell[data-view="grid"] .entry:focus-within .entry-action {
      opacity: 1;
      filter: blur(0);
      transform: scale(1);
    }

    .file-shell[data-view="grid"] .entry-action:active {
      transform: scale(0.96);
    }

    .empty-state,
    .error-state {
      min-height: calc(100vh - 180px);
      border-radius: 0;
      background: #ffffff;
      box-shadow: none;
    }

    .empty-state h2,
    .error-state h1 {
      font-size: 20px;
      font-weight: 600;
    }

    .toast {
      border: 1px solid #cfcfcf;
      border-radius: 4px;
      background: #ffffff;
      color: #1b1b1b;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
      font-weight: 400;
    }

    @media (max-width: 760px) {
      .file-shell {
        padding: 0;
      }

      .app-header {
        min-height: 50px;
        padding: 7px 10px;
      }

      .app-header,
      .title-cluster {
        align-items: center;
      }

      .app-header {
        flex-direction: row;
      }

      .title-cluster > div {
        width: auto;
      }

      .brand-mark {
        width: 32px;
        height: 32px;
      }

      h1 {
        font-size: 16px;
      }

      .header-meta {
        justify-content: flex-end;
      }

      .toolbar {
        grid-template-columns: minmax(0, 1fr) auto;
        padding: 5px 7px;
      }

      .action-group {
        grid-column: 1 / -1;
        grid-row: 1;
      }

      .path-form {
        grid-column: 1;
        grid-row: 2;
      }

      .view-toggle {
        grid-column: 2;
        grid-row: 2;
      }

      .content-panel {
        padding-inline: 6px;
      }

      .entry-main {
        min-height: 48px;
      }

      .file-shell[data-view="grid"] .entries {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .file-shell[data-view="grid"] .entry-main {
        min-height: 126px;
      }
    }

    /* Windows 11 Explorer structure: compact chrome, navigation pane and dense workspace. */
    html,
    body {
      height: 100%;
      overflow: hidden;
    }

    .app-frame {
      display: flex;
      height: 100vh;
      min-height: 0;
      flex-direction: column;
      overflow: hidden;
    }

    .app-header {
      min-height: 48px;
      flex: 0 0 48px;
      padding: 6px 14px;
      background: #f3f3f3;
    }

    .brand-mark {
      width: 30px;
      height: 30px;
    }

    .brand-mark .folder-icon {
      width: 27px;
      height: 27px;
    }

    .eyebrow {
      color: #646464;
      font-size: 10px;
    }

    h1 {
      max-width: min(60vw, 760px);
      overflow: hidden;
      color: #171717;
      font-size: 15px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .header-meta {
      display: none;
    }

    .toolbar {
      min-height: 50px;
      flex: 0 0 50px;
      grid-template-columns: auto minmax(260px, 1fr) auto;
      gap: 8px;
      padding: 5px 10px;
      background: #fbfbfb;
    }

    .icon-button,
    .text-button,
    .view-button {
      min-width: 36px;
      height: 36px;
      border-radius: 4px;
    }

    .icon-button .icon,
    .view-button .icon {
      width: 19px;
      height: 19px;
      stroke-width: 1.8;
    }

    .text-button {
      min-width: 58px;
      padding-inline: 12px;
    }

    .path-input {
      height: 36px;
    }

    .view-toggle {
      padding-inline-start: 8px;
      border-inline-start: 1px solid #dedede;
    }

    .explorer-layout {
      display: flex;
      min-height: 0;
      flex: 1 1 auto;
      direction: rtl;
      overflow: hidden;
      background: #ffffff;
    }

    .navigation-pane {
      width: 220px;
      min-width: 220px;
      height: 100%;
      padding: 8px 6px 12px;
      border-inline-end: 1px solid #dedede;
      background: #f7f7f7;
      direction: rtl;
      overflow-y: auto;
      scrollbar-width: thin;
    }

    .navigation-section + .navigation-section {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid #e3e3e3;
    }

    .navigation-heading {
      margin: 0 10px 5px;
      color: #686868;
      font-size: 11px;
      font-weight: 600;
    }

    .navigation-link {
      display: flex;
      width: 100%;
      min-height: 34px;
      align-items: center;
      gap: 9px;
      border: 1px solid transparent;
      border-radius: 4px;
      padding: 4px 9px;
      color: #252525;
      cursor: pointer;
      font-size: 12px;
      transition-property: background-color, border-color;
      transition-duration: 100ms;
      transition-timing-function: ease-out;
    }

    .navigation-link:hover {
      border-color: #d7ebfb;
      background: #eaf4fc;
    }

    .navigation-link.is-active {
      border-color: #c9e6fb;
      background: #dceefb;
    }

    .navigation-link.is-current-location {
      margin-top: 2px;
      cursor: default;
    }

    .navigation-icon {
      display: inline-flex;
      width: 22px;
      height: 22px;
      flex: 0 0 22px;
      align-items: center;
      justify-content: center;
      color: #4b6678;
    }

    .navigation-icon .icon {
      width: 18px;
      height: 18px;
      stroke-width: 1.7;
    }

    .navigation-icon .folder-icon {
      width: 21px;
      height: 21px;
    }

    .navigation-icon-computer {
      color: #39769c;
    }

    .navigation-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .explorer-workspace {
      display: flex;
      min-width: 0;
      min-height: 0;
      flex: 1 1 auto;
      flex-direction: column;
      direction: rtl;
      overflow: hidden;
      background: #ffffff;
    }

    .breadcrumbs {
      min-height: 40px;
      flex: 0 0 40px;
      padding: 3px 10px;
      background: #ffffff;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .breadcrumbs::-webkit-scrollbar {
      display: none;
    }

    .breadcrumbs-location {
      display: inline-flex;
      width: 24px;
      height: 24px;
      flex: 0 0 24px;
      align-items: center;
      justify-content: center;
      margin-inline-end: 2px;
    }

    .breadcrumbs-location .folder-icon {
      width: 21px;
      height: 21px;
    }

    .breadcrumb-separator {
      color: #969696;
    }

    .content-panel {
      min-height: 0;
      flex: 1 1 auto;
      padding: 0 10px 10px;
      overflow: auto;
      scrollbar-color: #c7c7c7 transparent;
      scrollbar-width: thin;
    }

    .content-heading {
      display: flex;
      min-height: 34px;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 5px 6px;
      border-bottom: 1px solid #e8e8e8;
    }

    .content-heading h2 {
      margin: 0;
      color: #303030;
      font-size: 12px;
      font-weight: 600;
    }

    .content-heading span {
      color: #757575;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }

    .entries {
      align-content: start;
    }

    .entry-main,
    .entry-head {
      grid-template-columns: 34px minmax(180px, 1fr) minmax(82px, 140px) minmax(68px, 100px) minmax(118px, 158px);
      min-height: 38px;
      gap: 6px;
      padding: 3px 42px 3px 7px;
    }

    .entry-head {
      position: sticky;
      z-index: 4;
      top: 0;
      min-height: 30px;
      padding-block: 3px;
      background: #fafafa;
    }

    .entry-icon {
      width: 29px;
      height: 29px;
    }

    .entry-icon .folder-icon {
      width: 28px;
      height: 28px;
    }

    .entry-icon .icon:not(.folder-icon) {
      width: 21px;
      height: 21px;
      stroke-width: 1.65;
    }

    .entry-name {
      font-size: 12px;
    }

    .entry-type,
    .entry-size,
    .entry-date {
      font-size: 11px;
    }

    .file-shell[data-view="grid"] .entries {
      display: grid;
      grid-template-columns: repeat(auto-fill, 178px);
      align-content: start;
      justify-content: start;
      gap: 5px;
      padding: 7px 2px;
    }

    .file-shell[data-view="grid"] .entry-head {
      display: none;
    }

    .file-shell[data-view="grid"] .entry {
      min-height: 76px;
      border-radius: 4px;
    }

    .file-shell[data-view="grid"] .entry-main {
      display: grid;
      min-height: 74px;
      grid-template-columns: 50px minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      grid-template-areas: "icon name";
      align-content: center;
      justify-items: stretch;
      gap: 8px;
      padding: 7px;
      text-align: right;
    }

    .file-shell[data-view="grid"] .entry-icon {
      grid-area: icon;
      width: 48px;
      height: 48px;
      align-self: center;
    }

    .file-shell[data-view="grid"] .entry-icon .folder-icon {
      width: 45px;
      height: 45px;
    }

    .file-shell[data-view="grid"] .entry-icon .icon:not(.folder-icon) {
      width: 31px;
      height: 31px;
    }

    .file-shell[data-view="grid"] .entry-name {
      grid-area: name;
      align-self: center;
      text-align: right;
      white-space: nowrap;
    }

    .file-shell[data-view="grid"] .entry-type {
      display: none;
    }

    .file-shell[data-view="grid"] .entry-size,
    .file-shell[data-view="grid"] .entry-date {
      display: none;
    }

    .status-bar {
      display: flex;
      min-height: 27px;
      flex: 0 0 27px;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 3px 10px;
      border-top: 1px solid #dedede;
      background: #f7f7f7;
      color: #686868;
      direction: rtl;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }

    .status-bar span:last-child {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (max-width: 900px) {
      .navigation-pane {
        width: 184px;
        min-width: 184px;
      }

      .entry-main,
      .entry-head {
        grid-template-columns: 34px minmax(140px, 1fr) minmax(76px, 110px) minmax(64px, 84px);
      }

      .entry-date,
      .entry-head > :last-child {
        display: none;
      }
    }

    @media (max-width: 700px) {
      html,
      body {
        overflow: auto;
      }

      .app-frame {
        height: auto;
        min-height: 100vh;
        overflow: visible;
      }

      .toolbar {
        min-height: auto;
        flex-basis: auto;
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .action-group {
        grid-column: 1 / -1;
      }

      .explorer-layout {
        min-height: calc(100vh - 180px);
        overflow: visible;
      }

      .navigation-pane {
        display: none;
      }

      .explorer-workspace,
      .content-panel {
        overflow: visible;
      }

      .status-bar span:last-child {
        display: none;
      }

      .file-shell[data-view="grid"] .entries {
        grid-template-columns: repeat(auto-fill, minmax(154px, 1fr));
      }

      .file-shell[data-view="grid"] .entry-main {
        min-height: 72px;
      }
    }
  </style>`
}

function renderBridgeScript({ currentPath, currentHref = '', parentHref, bridgePath = LOCAL_FILE_BRIDGE_PATH }) {
  const payload = jsonForScript({ bridgePath, currentHref, currentPath, parentHref, viewStorageKey })

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

      const applyExplorerTheme = () => {
        root.classList.add('light');
        root.style.setProperty('--color-primary-h', '208');
        root.style.setProperty('--color-primary-s', '100%');
        root.style.setProperty('--color-primary-l', '38%');
        root.style.setProperty('--color-primary', '208 100% 38%');
        root.style.setProperty('--color-primary-hex', '#0067c0');
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

      applyExplorerTheme();
      const savedView = (() => {
        try {
          return localStorage.getItem(state.viewStorageKey);
        } catch {
          return 'list';
        }
      })();
      setView(savedView === 'grid' ? 'grid' : 'list');

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
          const url = new URL(state.currentHref || state.bridgePath, window.location.origin);
          url.searchParams.set('search', '1');
          if (!state.currentHref) url.searchParams.set('path', state.currentPath);
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

      document.addEventListener('click', async (event) => {
        const button = event.target?.closest?.('[data-open-native="true"]');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();

        const filePath = button.dataset.path || '';
        if (!filePath) {
          showToast('לא נמצא נתיב לפתיחה');
          return;
        }

        button.disabled = true;
        button.classList.add('is-busy');

        try {
          const url = new URL(state.bridgePath, window.location.origin);
          url.searchParams.set('open', '1');
          url.searchParams.set('path', filePath);
          const response = await fetch(url.href, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'X-SiteBuilder-Local-Open': '1',
            },
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data?.error || 'לא ניתן לפתוח באפליקציה');
          showToast('נפתח באפליקציה');
        } catch (error) {
          showToast(error.message || 'לא ניתן לפתוח באפליקציה');
        } finally {
          button.disabled = false;
          button.classList.remove('is-busy');
        }
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

export function renderDirectoryPage(model, { allowNativeOpen = true, bridgePath = LOCAL_FILE_BRIDGE_PATH, hrefForPath = bridgeHrefFromPath } = {}) {
  const currentFolderName = toPathApi(process.platform).basename(model.currentPath) || model.currentPath
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
  <div class="file-shell" data-file-shell data-view="list">
    <div class="app-frame">
      <header class="app-header">
        <div class="title-cluster">
          <span class="brand-mark">${renderIcon('folder')}</span>
          <div>
            <p class="eyebrow">סייר הקבצים · תיקיות רשת</p>
            <h1 dir="auto">${htmlEscape(currentFolderName)}</h1>
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
        <form class="path-form" action="${htmlEscape(bridgePath)}" method="get">
          <label class="path-label" for="path-input">נתיב רשת</label>
          <input id="path-input" class="path-input" name="path" value="${htmlEscape(model.currentPath)}" autocomplete="off" spellcheck="false" />
          <input type="hidden" name="base" value="${htmlEscape(model.currentPath)}" />
          <button class="text-button" type="submit">עבור</button>
        </form>
        <span class="view-toggle" role="group" aria-label="מצב תצוגה">
          <button class="view-button" type="button" data-view-button="grid" aria-pressed="false" title="תצוגת קוביות" aria-label="תצוגת קוביות">${renderIcon('grid')}</button>
          <button class="view-button" type="button" data-view-button="list" aria-pressed="true" title="תצוגת פרטים" aria-label="תצוגת פרטים">${renderIcon('list')}</button>
        </span>
      </nav>

      <div class="explorer-layout">
        ${renderNavigationPane(model.currentPath, process.platform, hrefForPath)}
        <section class="explorer-workspace" aria-label="תוכן התיקייה">
          <nav class="breadcrumbs" aria-label="נתיב תיקייה">
            <span class="breadcrumbs-location">${renderIcon('folder')}</span>
            ${renderBreadcrumbs(model.breadcrumbs)}
          </nav>

          <main class="content-panel">
            <div class="content-heading">
              <h2>קבצים ותיקיות</h2>
              <span>${htmlEscape(model.itemCount)} פריטים</span>
            </div>
            ${renderDirectoryEntries(model.entries, { allowNativeOpen })}
          </main>
        </section>
      </div>
      <footer class="status-bar">
        <span>${htmlEscape(model.itemCount)} פריטים</span>
        <span dir="ltr">${htmlEscape(model.currentPath)}</span>
      </footer>
    </div>
  </div>
  <div class="toast" data-toast role="status" aria-live="polite"></div>
  ${renderBridgeScript({ bridgePath, currentHref: model.currentHref, currentPath: model.currentPath, parentHref: model.parentHref })}
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
  <div class="file-shell" data-file-shell data-view="list">
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
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(LOCAL_FILE_BRIDGE_PATH, (req, res) => {
        let attemptedPath = ''
        res.setHeader('Cache-Control', 'no-store')

        try {
          const requestUrl = new URL(req.url || '/', 'http://localhost')
          const isSearchRequest = requestUrl.searchParams.get('search') === '1'
          const isNativeOpenRequest = requestUrl.searchParams.get('open') === '1'

          if (isNativeOpenRequest) {
            if (!isAuthorizedNativeOpenRequest(req)) {
              sendJson(res, 403, { error: 'Native open requests must come from the local file manager UI' })
              return
            }

            try {
              const pathInput = requestUrl.searchParams.get('path') || ''
              const hrefInput = requestUrl.searchParams.get('href') || ''
              const basePath = requestUrl.searchParams.get('base') || ''
              const fileHref = pathInput ? fileHrefFromUserPath(pathInput, basePath) : hrefInput
              const filePath = filePathFromHref(fileHref)
              attemptedPath = filePath || pathInput || hrefInput

              if (!filePath) {
                sendJson(res, 400, { error: 'Unsupported file path' })
                return
              }

              const stat = fs.statSync(filePath)
              if (!stat.isFile() && !stat.isDirectory()) {
                sendJson(res, 400, { error: 'Path is not a file or directory' })
                return
              }

              openPathInDefaultApplication(filePath)
              sendJson(res, 200, { ok: true, isDirectory: stat.isDirectory(), path: filePath })
            } catch (error) {
              sendJson(res, 404, { error: error.message, path: attemptedPath })
            }
            return
          }

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
