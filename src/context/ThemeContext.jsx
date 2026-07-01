import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext({ theme: 'dark', toggle: () => {} })

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('mb_theme') || 'dark' } catch { return 'dark' }
  })

  useEffect(() => {
    const html = document.documentElement
    if (theme === 'light') {
      html.classList.add('light')
    } else {
      html.classList.remove('light')
    }
    try { localStorage.setItem('mb_theme', theme) } catch {}
  }, [theme])

  function toggle() {
    const html = document.documentElement
    html.classList.add('theme-switching')
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
    setTimeout(() => html.classList.remove('theme-switching'), 400)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
