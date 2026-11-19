// Ícono de la pestaña (y del acceso directo en iPhone) con el logo de la barbería.
const DEFAULTS = { icon: '/favicon.svg', apple: '/apple-touch-icon.png' }

function setLink(rel, href, type) {
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el) }
  el.href = href
  if (type) el.type = type; else el.removeAttribute('type')
}

export function applyBrandIcon(url) {
  try {
    if (url) {
      setLink('icon', url, 'image/png')
      setLink('apple-touch-icon', url)
    } else {
      setLink('icon', DEFAULTS.icon, 'image/svg+xml')
      setLink('apple-touch-icon', DEFAULTS.apple)
    }
  } catch { /* sin DOM: nada */ }
}
