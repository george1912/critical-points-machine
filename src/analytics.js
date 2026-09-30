/**
 * GoatCounter analytics (cookie-free). No-op until VITE_GOATCOUNTER_CODE is set at build time.
 * Only send event names — never file names, report text, scores from reports, or typed input.
 */

const CODE = String(import.meta.env.VITE_GOATCOUNTER_CODE || '').trim()
const ENDPOINT = CODE ? `https://${CODE}.goatcounter.com/count` : ''

const queue = []
let ready = false

const flush = () => {
  const gc = window.goatcounter
  if (!gc || typeof gc.count !== 'function') return
  ready = true
  while (queue.length) gc.count(queue.shift())
}

export const initAnalytics = () => {
  if (!ENDPOINT) return
  window.goatcounter = { ...(window.goatcounter || {}), endpoint: ENDPOINT }
  const script = document.createElement('script')
  script.async = true
  script.src = 'https://gc.zgo.at/count.js'
  script.dataset.goatcounter = ENDPOINT
  script.addEventListener('load', flush)
  document.head.appendChild(script)
}

export const track = (name, title = name) => {
  if (!ENDPOINT) return
  const payload = { path: name, title, event: true }
  if (ready) window.goatcounter.count(payload)
  else queue.push(payload)
}
