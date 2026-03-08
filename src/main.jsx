import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import { NavigationProvider } from './context/NavigationContext'
import { EventsProvider } from './context/EventsContext'
import { SiteContentProvider } from './context/SiteContentContext'
import { ThemeProvider } from './context/ThemeContext'
import { WidgetProvider } from './context/WidgetContext'
import { ExternalLinksProvider } from './context/ExternalLinksContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
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
    </BrowserRouter>
  </StrictMode>,
)
