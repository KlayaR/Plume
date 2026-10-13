import React from 'react'
import ReactDOM from 'react-dom/client'
import './studio-kit/index.css'
import { getTheme, initTheme, onThemeChange } from './studio-kit/theme.js'
import App from './App'
import './styles.css'

initTheme()

function start() {
  // The native title bar follows the app's theme (Auto: Windows decides).
  if ('__TAURI_INTERNALS__' in window) {
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      const win = getCurrentWindow()
      const apply = (pref: string) => win.setTheme(pref === 'auto' ? null : (pref as 'dark' | 'light')).catch(() => {})
      apply(getTheme())
      onThemeChange(apply)
    })
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

// `npm run dev:vite` then /?mock: a sample book and a fake claude, for trying the UI in a browser.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) import('./dev/mockTauri').then(start)
else start()
