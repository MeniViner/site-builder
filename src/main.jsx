import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import UnauthorizedSiteBlocker from './components/UnauthorizedSiteBlocker'
import { AuthProvider } from './context/AuthContext'
import { NavigationProvider } from './context/NavigationContext'
import { EventsProvider } from './context/EventsContext'
import { SiteContentProvider } from './context/SiteContentContext'
import { ThemeProvider } from './context/ThemeContext'
import { WidgetProvider } from './context/WidgetContext'
import { ExternalLinksProvider } from './context/ExternalLinksContext'
import { ConfigProvider } from './context/ConfigProvider'
import { OrgChartProvider } from './context/OrgChartContext'
import { GanttProvider } from './context/GanttContext'
import { getRuntimeConfig, getRuntimeLog, loadRuntimeConfig } from './services/storage/runtimeConfig'
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
  const runtimeConfig = getRuntimeConfig() || {};
  const runtimeLog = getRuntimeLog();
  if (runtimeLog.loaded) {
    console.info(`[site-builder] Runtime config source: ${runtimeLog.source}`);
  }

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
                      <ThemeProvider>
                        <WidgetProvider>
                          <ExternalLinksProvider>
                            <App />
                          </ExternalLinksProvider>
                        </WidgetProvider>
                      </ThemeProvider>
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
})
