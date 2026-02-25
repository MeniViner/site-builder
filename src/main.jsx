import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { EventsProvider } from './context/EventsContext'
import { NavigationProvider } from './context/NavigationContext'
import { AuthProvider } from './context/AuthContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <NavigationProvider>
          <EventsProvider>
            <App />
          </EventsProvider>
        </NavigationProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
