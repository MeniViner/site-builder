import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import UnauthorizedSiteBlocker from './components/UnauthorizedSiteBlocker'
import { getRuntimeConfig, getRuntimeLog, loadRuntimeConfig } from './services/storage/runtimeConfig'
import { getStorageDiagnostics, initializeStorageDescriptor } from './services/storage/storageBackend'
import {
  buildExpectedSharePointSiteRoot,
  isAllowedSharePointRuntimeLocation,
} from './utils/siteRuntimeGuard'

const expectedSiteRoot = buildExpectedSharePointSiteRoot(
  import.meta.env.VITE_SP_HOST,
  import.meta.env.VITE_SP_SITE_CODE,
)

const currentRuntimeLocation = typeof window === 'undefined'
  ? ''
  : `${window.location.origin}${window.location.pathname}`

const renderApp = async () => {
  await loadRuntimeConfig();
  initializeStorageDescriptor();
  if (import.meta.env.DEV) {
    const { isKasharDemoProfile } = await import('./demo-data/demoProfile')
    if (isKasharDemoProfile()) {
      const { installKasharDevRecovery } = await import('./services/KasharDevRecovery')
      installKasharDevRecovery({ isKashar: () => true })
    }
  }
  const runtimeConfig = getRuntimeConfig() || {};
  const runtimeLog = getRuntimeLog();
  const storageDiagnostics = getStorageDiagnostics();
  if (runtimeLog.loaded) {
    console.info(`[site-builder] Runtime config source: ${runtimeLog.source}`);
  }
  console.info('[site-builder] Storage descriptor:', storageDiagnostics);

  // Storage-dependent modules are intentionally imported only after the
  // immutable runtime descriptor has been resolved.
  const [
    { default: App },
    { AuthProvider },
    { NavigationProvider },
    { EventsProvider },
    { SiteContentProvider },
    { ThemeProvider },
    { WidgetProvider },
    { ExternalLinksProvider },
    { ConfigProvider },
    { OrgChartProvider },
    { GanttProvider },
    { ImageGalleryProvider },
  ] = await Promise.all([
    import('./App.jsx'),
    import('./context/AuthContext'),
    import('./context/NavigationContext'),
    import('./context/EventsContext'),
    import('./context/SiteContentContext'),
    import('./context/ThemeContext'),
    import('./context/WidgetContext'),
    import('./context/ExternalLinksContext'),
    import('./context/ConfigProvider'),
    import('./context/OrgChartContext'),
    import('./context/GanttContext'),
    import('./context/ImageGalleryContext'),
  ]);

  const runtimeAllowed = typeof window === 'undefined'
    ? true
    : isAllowedSharePointRuntimeLocation(window.location, {
      ...import.meta.env,
      allowedSiteRoot: runtimeConfig.allowedSiteRoot,
      sharePointSiteUrl: runtimeConfig.sharePointSiteUrl,
      siteRoot: runtimeConfig.siteRoot,
      finalAppUrl: runtimeConfig.finalAppUrl,
      targetSiteUrl: runtimeConfig.targetSiteUrl,
    })
  const expectedRuntimeSiteRoot = runtimeConfig.allowedSiteRoot || runtimeConfig.sharePointSiteUrl || expectedSiteRoot

  const root = document.getElementById('root')
  if (!root) {
    throw new Error('Root element not found: #root')
  }

  createRoot(root).render(
    <StrictMode>
      {runtimeAllowed ? (
        <HashRouter>
          <ConfigProvider>
            <AuthProvider>
              <NavigationProvider>
                <EventsProvider>
                  <SiteContentProvider>
                    <OrgChartProvider>
                    <GanttProvider>
                      <ImageGalleryProvider>
                        <ThemeProvider>
                          <WidgetProvider>
                            <ExternalLinksProvider>
                              <App />
                            </ExternalLinksProvider>
                          </WidgetProvider>
                        </ThemeProvider>
                      </ImageGalleryProvider>
                    </GanttProvider>
                    </OrgChartProvider>
                  </SiteContentProvider>
                </EventsProvider>
              </NavigationProvider>
            </AuthProvider>
          </ConfigProvider>
        </HashRouter>
      ) : (
        <UnauthorizedSiteBlocker
          currentLocation={currentRuntimeLocation}
          expectedSiteRoot={expectedRuntimeSiteRoot}
          showDetails={import.meta.env.DEV === true}
        />
      )}
    </StrictMode>,
  )
}

renderApp().catch((error) => {
  console.error('[site-builder] Failed to bootstrap frontend runtime config:', error)
  const runtimeDiagnostics = getRuntimeLog()
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, '__SITE_BUILDER_RUNTIME_DIAGNOSTICS__', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: runtimeDiagnostics,
    })
  }

  const root = document.getElementById('root')
  if (!root) return
  const safeCode = String(error?.code || 'bootstrap_failed').replace(/[^a-zA-Z0-9_-]/g, '')
  createRoot(root).render(
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0c0d12] px-6 text-white">
      <div className="max-w-xl rounded-xl border border-red-400/40 bg-red-500/10 p-6 text-center shadow-2xl">
        <h1 className="text-xl font-black">אתחול שכבת הנתונים נכשל</h1>
        <p className="mt-3 text-sm text-red-100">
          הגדרת האחסון אינה תקינה. האתר נחסם כדי למנוע קריאה או כתיבה למסד נתונים שגוי.
        </p>
        <p className="mt-3 font-mono text-xs text-red-200">{safeCode}</p>
      </div>
    </div>,
  )
})
