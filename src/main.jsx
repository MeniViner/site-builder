import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import { NavigationProvider } from './context/NavigationContext'
import { EventsProvider } from './context/EventsContext'
import { SiteContentProvider } from './context/SiteContentContext'
import { ThemeProvider } from './context/ThemeContext'
import { WidgetProvider } from './context/WidgetContext'
import { ExternalLinksProvider } from './context/ExternalLinksContext'
import { ConfigProvider } from './context/ConfigProvider'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <ConfigProvider>
        <AuthProvider>
          <NavigationProvider>
            <EventsProvider>
              <SiteContentProvider>
                <ThemeProvider>
                  <WidgetProvider>
                    <ExternalLinksProvider>
                      <App />
                    </ExternalLinksProvider>
                  </WidgetProvider>
                </ThemeProvider>
              </SiteContentProvider>
            </EventsProvider>
          </NavigationProvider>
        </AuthProvider>
      </ConfigProvider>
    </HashRouter>
  </StrictMode>,
)
