import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
// Import mit Seiteneffekt: setzt die .dark-Klasse aus localStorage/System, noch bevor
// React rendert. Die Settings-Ansicht ist damit nicht die erste Berührung mit dem Store.
import './store/themeStore'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
