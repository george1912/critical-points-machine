import './style.css'

/** Default passphrase: cp-dev-2026 — override with VITE_ADMIN_PASS_HASH in deploy secrets. */
const ADMIN_PASS_HASH =
  String(import.meta.env.VITE_ADMIN_PASS_HASH || '').trim() ||
  'c1382d2a7b2639879d4a934a8db6a607fb356e95a8e95430236ccfd47a6748ee'

const WEBHOOK_CONFIGURED = Boolean(String(import.meta.env.VITE_BUG_WEBHOOK_URL || '').trim())
const SESSION_KEY = 'cpws:admin-ok'

const app = document.querySelector('#app')

const sha256Hex = async (value) => {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const renderLocked = () => {
  app.innerHTML = `
    <main class="shell">
      <div class="device-frame page-shell">
        <p class="page-back"><a class="text-link" href="./">← Back to Worksheet Filler</a></p>
        <header class="hero">
          <p class="eyebrow">Developer</p>
          <h1>Bug<br /><span class="title-accent">triage</span></h1>
          <p class="lede">Private developer view. Not for classmates.</p>
        </header>
        <form class="bug-form" id="adminUnlock">
          <div class="bug-field">
            <label for="adminPass">Passphrase</label>
            <input id="adminPass" type="password" autocomplete="current-password" required />
          </div>
          <button type="submit">Unlock</button>
          <p class="bug-status" id="adminStatus" aria-live="polite"></p>
        </form>
      </div>
    </main>
  `

  document.querySelector('#adminUnlock').addEventListener('submit', async (event) => {
    event.preventDefault()
    const statusEl = document.querySelector('#adminStatus')
    const pass = document.querySelector('#adminPass').value
    const hash = await sha256Hex(pass)
    if (hash !== ADMIN_PASS_HASH) {
      statusEl.textContent = 'Wrong passphrase.'
      statusEl.classList.add('error')
      return
    }
    sessionStorage.setItem(SESSION_KEY, '1')
    renderUnlocked()
  })
}

const renderUnlocked = () => {
  app.innerHTML = `
    <main class="shell">
      <div class="device-frame page-shell">
        <p class="page-back"><a class="text-link" href="./">← Back to Worksheet Filler</a></p>
        <header class="hero">
          <p class="eyebrow">Developer</p>
          <h1>Bug<br /><span class="title-accent">triage</span></h1>
          <p class="lede">
            Reports go to your private webhook inbox (Discord/Slack), not onto the public website.
          </p>
        </header>

        <section class="admin-panel">
          <p class="bug-warning">
            Inbox status:
            <strong>${WEBHOOK_CONFIGURED ? 'Connected' : 'Not connected yet'}</strong>.
            ${
              WEBHOOK_CONFIGURED
                ? 'Open your Discord/Slack channel to read and fix reports.'
                : 'Connect a webhook so student reports stay private.'
            }
          </p>

          <div class="admin-list">
            <article class="admin-card">
              <h3>1. Create a private channel</h3>
              <p>In Discord or Slack, make a private channel only you can see (example: #critical-points-bugs).</p>
            </article>
            <article class="admin-card">
              <h3>2. Add an incoming webhook</h3>
              <p>Create a webhook for that channel. Copy the webhook URL. Never commit it to git.</p>
            </article>
            <article class="admin-card">
              <h3>3. Store it as a GitHub secret</h3>
              <p>Repo → Settings → Secrets and variables → Actions → New repository secret.</p>
              <p class="admin-meta">Name: BUG_WEBHOOK_URL</p>
              <p class="admin-meta">Then re-run “Deploy to GitHub Pages”.</p>
            </article>
            <article class="admin-card">
              <h3>Why this is safer</h3>
              <p>
                The public site never lists reports. Students cannot browse other people’s bugs.
                Do not accept ATI PDFs in the form — images of the tool only, with PII checks.
              </p>
            </article>
          </div>

          <p class="human-check-links">
            <a class="text-link" href="./bug.html">Open public bug form</a>
            <span class="human-check-sep" aria-hidden="true">·</span>
            <button type="button" id="adminLock" class="text-link" style="border:0;background:none;padding:0;font:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:3px">Lock</button>
          </p>
        </section>
      </div>
    </main>
  `

  document.querySelector('#adminLock')?.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY)
    renderLocked()
  })
}

if (sessionStorage.getItem(SESSION_KEY) === '1') {
  renderUnlocked()
} else {
  renderLocked()
}
