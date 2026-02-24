import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { EventsProvider } from './context/EventsContext'
import { NavigationProvider } from './context/NavigationContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <NavigationProvider>
      <EventsProvider>
        <App />
      </EventsProvider>
    </NavigationProvider>
  </StrictMode>,
)
