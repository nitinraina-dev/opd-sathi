import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App.jsx'
import { unlockAudio } from './lib/sound.js'
import { getSettings, effectiveTextSize } from './lib/settings.js'
import { registerServiceWorker } from './lib/notify.js'
import './index.css'

// Apply saved contrast, text size and language before the first paint, so the
// screen never flashes in the wrong colours or size.
{
  const s = getSettings()
  const html = document.documentElement
  const patient = !/^\/(staff|board)/.test(location.pathname)
  html.classList.toggle('hc', s.contrast)
  html.classList.toggle('staff', location.pathname.startsWith('/staff'))
  const size = patient ? effectiveTextSize(s) : 0
  if (size) html.classList.add(`ts-${size}`)
  if (patient && s.lang) html.lang = s.lang
}

// Browsers allow sound only after a tap; unlock it on the first one.
window.addEventListener('pointerdown', unlockAudio)
window.addEventListener('keydown', unlockAudio)

registerServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
