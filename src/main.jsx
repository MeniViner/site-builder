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
import {
  buildExpectedSharePointSiteRoot,
  isAllowedSharePointRuntimeLocation,
} from './utils/siteRuntimeGuard'

const runtimeAllowed = typeof window === 'undefined'
  ? true
  : isAllowedSharePointRuntimeLocation(window.location, import.meta.env)

const expectedSiteRoot = buildExpectedSharePointSiteRoot(
  import.meta.env.VITE_SP_HOST,
  import.meta.env.VITE_SP_SITE_CODE,
)

const currentRuntimeLocation = typeof window === 'undefined'
  ? ''
  : `${window.location.origin}${window.location.pathname}`

createRoot(document.getElementById('root')).render(
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
        expectedSiteRoot={expectedSiteRoot}
        showDetails={import.meta.env.DEV === true}
      />
    )}
  </StrictMode>,
)
