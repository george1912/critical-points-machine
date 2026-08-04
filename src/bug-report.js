import './style.css'

const WEBHOOK_URL = String(import.meta.env.VITE_BUG_WEBHOOK_URL || '').trim()
const MAX_IMAGE_BYTES = 900_000

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="shell">
    <div class="device-frame page-shell">
      <p class="page-back"><a class="text-link" href="./">← Back to Worksheet Filler</a></p>

      <header class="hero">
        <p class="eyebrow">Critical Points Machine</p>
        <h1>Report a<br /><span class="title-accent">bug</span></h1>
        <p class="lede">
          Tell us what went wrong. Keep it simple. No personal info.
        </p>
      </header>

      <p class="bug-warning">
        Do not upload ATI score reports, student names, IDs, school names, or emails.
        Screenshots of this website only. If your screenshot shows personal data, crop it out first.
      </p>

      <form class="bug-form" id="bugForm">
        <div class="bug-field">
          <label for="bugMessage">What happened?</label>
          <p class="field-hint">Example: “Safety category was wrong on the sample report.”</p>
          <textarea id="bugMessage" name="message" required maxlength="2000" placeholder="Short description…"></textarea>
        </div>

        <div class="bug-field">
          <span class="field-label">Screenshot (optional)</span>
          <p class="field-hint">PNG or JPG of the tool. No PDFs. Max about 1 MB.</p>
          <input id="bugScreenshot" type="file" accept="image/png,image/jpeg,image/webp" />
        </div>

        <div class="bug-field">
          <span class="field-label">Example image (optional)</span>
          <p class="field-hint">Another cropped screenshot if it helps. No ATI report PDFs.</p>
          <input id="bugExample" type="file" accept="image/png,image/jpeg,image/webp" />
        </div>

        <label class="bug-check">
          <input id="bugConfirm" type="checkbox" required />
          <span>I confirm this report has no names, student IDs, emails, or school information.</span>
        </label>

        <button type="submit" id="bugSubmit">Send bug report</button>
        <p class="bug-status" id="bugStatus" aria-live="polite"></p>
      </form>
    </div>
  </main>
`

const formEl = document.querySelector('#bugForm')
const messageEl = document.querySelector('#bugMessage')
const screenshotEl = document.querySelector('#bugScreenshot')
const exampleEl = document.querySelector('#bugExample')
const statusEl = document.querySelector('#bugStatus')
const submitEl = document.querySelector('#bugSubmit')

const setBugStatus = (text, kind = '') => {
  statusEl.textContent = text
  statusEl.classList.toggle('error', kind === 'error')
  statusEl.classList.toggle('ok', kind === 'ok')
}

const looksLikePii = (text) => {
  const value = String(text || '')
  const checks = [
    /\b\d{8,12}\b/, // student-number shaped
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /\b(ssn|social security|date of birth|dob)\b/i,
    /\b(uloa|ulloa|suny downstate)\b/i,
    /\bstudent\s*(id|number|name)\s*[:=]/i,
  ]
  return checks.some((re) => re.test(value))
}

const readImageFile = async (inputEl, label) => {
  const file = inputEl.files?.[0]
  if (!file) return null
  if (!file.type.startsWith('image/')) {
    throw new Error(`${label} must be an image (PNG/JPG), not a PDF.`)
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`${label} is too large. Please crop or compress it under 1 MB.`)
  }
  return file
}

const buildDiscordPayload = (message) => {
  const stamp = new Date().toISOString()
  return {
    username: 'Critical Points Bug Box',
    content: null,
    embeds: [
      {
        title: 'Bug report',
        description: message.slice(0, 1800),
        color: 3129201,
        footer: { text: 'Critical Points Machine · scrubbed user report' },
        timestamp: stamp,
      },
    ],
  }
}

const submitToWebhook = async (message, files) => {
  const payload = buildDiscordPayload(message)

  if (!files.length) {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      throw new Error(`Could not send report (${response.status}).`)
    }
    return
  }

  const body = new FormData()
  body.append('payload_json', JSON.stringify(payload))
  files.forEach((file, index) => {
    body.append(`files[${index}]`, file, file.name || `image-${index + 1}.png`)
  })

  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    body,
  })
  if (!response.ok) {
    throw new Error(`Could not send report (${response.status}).`)
  }
}

const downloadFallbackPacket = (message, files) => {
  const lines = [
    'Critical Points Machine — bug report',
    `Time: ${new Date().toISOString()}`,
    '',
    message,
    '',
    `Attached images: ${files.map((f) => f.name).join(', ') || 'none'}`,
    '',
    'Note: inbox webhook is not configured on this deploy.',
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `critical-points-bug-${Date.now()}.txt`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

formEl.addEventListener('submit', async (event) => {
  event.preventDefault()
  setBugStatus('')

  const message = messageEl.value.trim()
  if (message.length < 8) {
    setBugStatus('Please write a little more detail.', 'error')
    return
  }
  if (looksLikePii(message)) {
    setBugStatus(
      'Please remove personal details (IDs, emails, school names) before sending.',
      'error',
    )
    return
  }

  try {
    submitEl.disabled = true
    setBugStatus('Sending…')

    const screenshot = await readImageFile(screenshotEl, 'Screenshot')
    const example = await readImageFile(exampleEl, 'Example image')
    const files = [screenshot, example].filter(Boolean)

    if (WEBHOOK_URL) {
      await submitToWebhook(message, files)
      formEl.reset()
      setBugStatus('Sent. Thank you — the developer will review it privately.', 'ok')
      return
    }

    downloadFallbackPacket(message, files)
    setBugStatus(
      'Inbox is not connected on this site yet, so a text copy downloaded for you to send another way.',
      'error',
    )
  } catch (error) {
    console.error(error)
    setBugStatus(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    submitEl.disabled = false
  }
})
