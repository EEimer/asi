import { useEffect, useState } from 'react'

const STORAGE_KEY = 'asi_theme'

export type Theme = 'light' | 'dark'

/** Ohne gespeicherte Wahl folgt die App dem Betriebssystem. */
function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'dark' || v === 'light') return v
  } catch { /* ignore */ }
  return systemTheme()
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (theme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
}

let currentTheme = getStoredTheme()
applyTheme(currentTheme)

/* Same-Tab-Subscriber: das storage-Event feuert nur in ANDEREN Tabs. Ohne diese
   Liste bliebe der Umschalter in den Settings nach einem Wechsel auf dem alten Wert. */
const listeners = new Set<() => void>()

export const themeStore = {
  getTheme: (): Theme => currentTheme,
  setTheme: (theme: Theme) => {
    currentTheme = theme
    try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* ignore */ }
    applyTheme(theme)
    listeners.forEach(l => l())
  },
  toggle: (): Theme => {
    const next = currentTheme === 'dark' ? 'light' : 'dark'
    themeStore.setTheme(next)
    return next
  },
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(currentTheme)
  useEffect(() => {
    const apply = () => setThemeState(themeStore.getTheme())
    apply()
    listeners.add(apply)
    window.addEventListener('storage', apply)
    return () => {
      listeners.delete(apply)
      window.removeEventListener('storage', apply)
    }
  }, [])
  return {
    theme,
    isDark: theme === 'dark',
    setTheme: (t: Theme) => { themeStore.setTheme(t); setThemeState(themeStore.getTheme()) },
    toggle: () => { const next = themeStore.toggle(); setThemeState(next); return next },
  }
}
