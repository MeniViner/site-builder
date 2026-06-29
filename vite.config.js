import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import process from 'process'
import { fileURLToPath, pathToFileURL } from 'url'

const htmlEscape = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
}

function filePathFromHref(href) {
  const url = new URL(String(href || ''))
  if (url.protocol !== 'file:') return ''

  if (process.platform === 'win32') {
    if (url.hostname) {
      return `\\\\${url.hostname}${decodeURIComponent(url.pathname).replace(/\//g, '\\')}`
    }
    return decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\')
  }

  if (url.hostname) return ''
  return fileURLToPath(url)
}

function fileHrefFromPath(filePath) {
  return pathToFileURL(filePath).href
}

function renderDirectoryPage({ currentPath, entries }) {
  const rows = entries.map((entry) => {
    const href = `/__sitebuilder-local-file?href=${encodeURIComponent(fileHrefFromPath(entry.fullPath))}`
    const suffix = entry.isDirectory ? '/' : ''
    const label = `${entry.name}${suffix}`
    return `<li><a href="${href}">${htmlEscape(label)}</a></li>`
  }).join('\n')

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${htmlEscape(currentPath)}</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #0f172a; color: #e5e7eb; }
    main { max-width: 960px; margin: 0 auto; padding: 32px; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    code { direction: ltr; display: block; padding: 12px; border: 1px solid #334155; border-radius: 8px; background: #020617; overflow: auto; }
    ul { list-style: none; padding: 0; margin: 24px 0 0; display: grid; gap: 8px; }
    a { display: block; direction: ltr; text-align: left; color: #bae6fd; background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 10px 12px; text-decoration: none; }
    a:hover { border-color: #38bdf8; color: white; }
  </style>
</head>
<body>
  <main>
    <h1>תוכן תיקייה</h1>
    <code>${htmlEscape(currentPath)}</code>
    <ul>${rows}</ul>
  </main>
</body>
</html>`
}

function localFileBridgePlugin() {
  return {
    name: 'sitebuilder-local-file-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__sitebuilder-local-file', (req, res) => {
        try {
          const requestUrl = new URL(req.url || '/', 'http://localhost')
          const href = requestUrl.searchParams.get('href') || ''
          const filePath = filePathFromHref(href)
          if (!filePath) {
            res.statusCode = 400
            res.end('Unsupported file URL')
            return
          }

          const stat = fs.statSync(filePath)
          if (stat.isDirectory()) {
            const entries = fs.readdirSync(filePath, { withFileTypes: true })
              .map((entry) => ({
                name: entry.name,
                isDirectory: entry.isDirectory(),
                fullPath: path.join(filePath, entry.name),
              }))
              .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name))
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(renderDirectoryPage({ currentPath: filePath, entries }))
            return
          }

          res.setHeader('Content-Type', contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream')
          fs.createReadStream(filePath).pipe(res)
        } catch (error) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(`Unable to open local file: ${error.message}`)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), localFileBridgePlugin()],
})
