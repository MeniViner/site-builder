import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  fileHrefFromPath,
  fileHrefFromUserPath,
  filePathFromHref,
  formatBytes,
  getDefaultOpenCommand,
  readDirectoryModel,
  renderDirectoryPage,
  searchDirectoryModel,
} from './localFileBridge.js'

const tempDirs = []

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-file-bridge-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { force: true, recursive: true })
  }
})

describe('local file bridge path helpers', () => {
  it('converts Windows file URLs to local and UNC paths', () => {
    expect(filePathFromHref('file:///C:/Temp/My%20File.txt', 'win32')).toBe('C:\\Temp\\My File.txt')
    expect(filePathFromHref('file://server/share/folder%20name', 'win32')).toBe('\\\\server\\share\\folder name')
  })

  it('converts Windows drive and UNC paths to file URLs', () => {
    expect(fileHrefFromPath('C:\\Temp\\My File.txt', 'win32')).toBe('file:///C:/Temp/My%20File.txt')
    expect(fileHrefFromPath('\\\\server\\share\\folder name', 'win32')).toBe('file://server/share/folder%20name')
  })

  it('resolves typed relative paths from the current directory', () => {
    const dir = makeTempDir()
    const expected = pathToFileURL(path.join(dir, 'inner folder')).href

    expect(fileHrefFromUserPath('inner folder', dir)).toBe(expected)
  })

  it('resolves typed Windows drive paths and relative paths', () => {
    expect(fileHrefFromUserPath('C:\\Temp\\Work Folder', '', 'win32')).toBe('file:///C:/Temp/Work%20Folder')
    expect(fileHrefFromUserPath('child folder', 'C:\\Temp', 'win32')).toBe('file:///C:/Temp/child%20folder')
  })

  it('resolves typed Windows UNC network paths', () => {
    expect(fileHrefFromUserPath('\\\\server\\share\\folder name', '', 'win32')).toBe('file://server/share/folder%20name')
    expect(fileHrefFromUserPath('//server/share/folder name', '', 'win32')).toBe('file://server/share/folder%20name')
  })

  it('keeps typed file URLs normalized through the bridge parser', () => {
    const dir = makeTempDir()
    const href = pathToFileURL(path.join(dir, 'example file.txt')).href

    expect(fileHrefFromUserPath(href, dir)).toBe(href)
  })

  it('builds native default-app open commands per operating system', () => {
    expect(getDefaultOpenCommand('/tmp/report file.docx', 'darwin')).toEqual({
      command: 'open',
      args: ['/tmp/report file.docx'],
      options: { detached: true, stdio: 'ignore' },
    })
    expect(getDefaultOpenCommand('C:\\Temp\\report file.xlsx', 'win32')).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '', 'C:\\Temp\\report file.xlsx'],
      options: { detached: true, stdio: 'ignore', windowsHide: true },
    })
    expect(getDefaultOpenCommand('\\\\server\\share\\report file.xlsx', 'win32')).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '', '\\\\server\\share\\report file.xlsx'],
      options: { detached: true, stdio: 'ignore', windowsHide: true },
    })
    expect(getDefaultOpenCommand('/tmp/report file.pdf', 'linux')).toEqual({
      command: 'xdg-open',
      args: ['/tmp/report file.pdf'],
      options: { detached: true, stdio: 'ignore' },
    })
  })
})

describe('local file bridge directory rendering', () => {
  it('builds sorted directory data and renders file-manager controls', () => {
    const dir = makeTempDir()
    fs.mkdirSync(path.join(dir, 'folder b'))
    fs.writeFileSync(path.join(dir, 'alpha.txt'), 'hello')

    const model = readDirectoryModel(dir)
    expect(model.entries.map((entry) => entry.name)).toEqual(['folder b', 'alpha.txt'])
    expect(model.entries[0]).toEqual(expect.objectContaining({ isDirectory: true, label: 'תיקייה' }))
    expect(model.entries[1]).toEqual(expect.objectContaining({ isDirectory: false, label: 'TXT', sizeLabel: '5 B' }))

    const html = renderDirectoryPage(model)
    expect(html).toContain('data-file-shell')
    expect(html).toContain('data-view="list"')
    expect(html).toContain(`<h1 dir="auto">${path.basename(dir)}</h1>`)
    expect(html).toContain('<span lang="en">SITE BUILDER</span> · סייר הקבצים הארגוני')
    expect(html).toContain('data-action="portal-home"')
    expect(html).toContain("window.parent.postMessage({ type: 'site-builder:navigate-home' }, '*')")
    expect(html).toContain('font-family: "Segoe UI", Arial, sans-serif')
    expect(html).toContain('--color-primary-hex: #0067c0')
    expect(html).toContain('color-scheme: light')
    expect(html).not.toContain('fonts.googleapis.com')
    expect(html).toContain('data-action="search-toggle"')
    expect(html).toContain('data-search-input')
    expect(html).toContain('data-search-results')
    expect(html).toContain('data-action="back"')
    expect(html).toContain('data-view-button="grid"')
    expect(html).toContain('data-view-button="list" aria-pressed="true"')
    expect(html).toContain('<nav class="toolbar"')
    expect(html).toContain('<aside class="navigation-pane"')
    expect(html).toContain('גישה מהירה')
    expect(html).toContain('<section class="explorer-workspace"')
    expect(html).toContain('<div class="content-heading">')
    expect(html).toContain('<footer class="status-bar">')
    expect(html).toContain('class="icon folder-icon"')
    expect(html).toContain('fill="#FFD35A"')
    expect(html).toContain('.file-shell[data-view="grid"] .entry-type {\n      display: none;')
    expect(html).toContain('<form class="path-form"')
    expect(html).toContain(`value="${dir}`)
    expect(html).toContain('folder b')
    expect(html).toContain('alpha.txt')
    expect(html).toContain('target="_blank" rel="noopener"')
    expect(html).toContain('data-open-file="true"')
    expect(html).toContain('data-open-native="true"')
    expect(html).toContain('פתח באפליקציה')
  })

  it('allows the production adapter to retain the UI while replacing navigation and native-open controls', () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'alpha.txt'), 'hello')
    const model = readDirectoryModel(dir)
    const html = renderDirectoryPage({
      ...model,
      currentHref: '/api/file-explorer?target=current',
      entries: model.entries.map((entry) => ({ ...entry, href: '/api/file-explorer?target=child' })),
      parentHref: '/api/file-explorer?target=parent',
    }, { allowNativeOpen: false, bridgePath: '/api/file-explorer', hrefForPath: () => '/api/file-explorer?target=nav' })
    expect(html).toContain('"bridgePath":"/api/file-explorer"')
    expect(html).toContain('/api/file-explorer?target=child')
    expect(html).not.toContain('class="entry-action"')
  })

  it('formats byte sizes for the list view', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024 * 2)).toBe('2.0 MB')
  })

  it('searches recursively inside the current folder', () => {
    const dir = makeTempDir()
    fs.mkdirSync(path.join(dir, 'network reports'))
    fs.mkdirSync(path.join(dir, 'network reports', 'archive'))
    fs.writeFileSync(path.join(dir, 'network reports', 'archive', 'budget-final.xlsx'), 'sheet')
    fs.writeFileSync(path.join(dir, 'visible.txt'), 'hello')

    const model = searchDirectoryModel(dir, 'budget')
    expect(model).toEqual(expect.objectContaining({
      query: 'budget',
      resultCount: 1,
      rootPath: dir,
      truncated: false,
    }))
    expect(model.results[0]).toEqual(expect.objectContaining({
      isDirectory: false,
      label: 'XLSX',
      name: 'budget-final.xlsx',
      relativePath: path.join('network reports', 'archive', 'budget-final.xlsx'),
    }))
  })

  it('limits recursive search results for large folders', () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'match-a.txt'), 'a')
    fs.writeFileSync(path.join(dir, 'match-b.txt'), 'b')

    const model = searchDirectoryModel(dir, 'match', undefined, { resultLimit: 1 })
    expect(model.resultCount).toBe(1)
    expect(model.truncated).toBe(true)
  })
})
