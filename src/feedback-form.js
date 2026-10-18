import { track } from './analytics.js'
import {
  FEEDBACK_RECIPIENT,
  contactLooksLikeEmail,
  inspectFeedbackDraft,
} from './feedback-draft.js'

const SEND_URL = `https://formsubmit.co/ajax/${FEEDBACK_RECIPIENT}`

export const postFeedback = async ({ blurb, contact, file }) => {
  const body = new FormData()
  body.set('_subject', 'Critical Points Machine feedback')
  body.set('_captcha', 'false')
  body.set('_template', 'box')
  body.set('blurb', blurb || '(No blurb. The picture or PDF is attached.)')
  body.set('contact', contact || 'Not provided')
  if (contact && contactLooksLikeEmail(contact)) body.set('_replyto', contact)
  if (file) body.set('attachment', file)

  let response
  try {
    response = await fetch(SEND_URL, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body,
    })
  } catch {
    throw new Error('Could not send. Check your connection and try again.')
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  const success = payload && String(payload.success) === 'true'
  if (!response.ok || (payload && payload.success !== undefined && !success)) {
    const detail = String(payload?.message || '')
    if (/activat|confirm/i.test(detail)) {
      throw new Error('The note was received for confirmation. The inbox still needs a one-time activation.')
    }
    throw new Error('Could not send. Check your connection and try again.')
  }
}

export const mountFeedbackForm = () => {
  const form = document.querySelector('#feedbackForm')
  const panel = document.querySelector('#feedbackPanel')
  if (!form || !panel) return

  const blurbEl = form.querySelector('#feedbackBlurb')
  const fileEl = form.querySelector('#feedbackFile')
  const dropEl = form.querySelector('#feedbackDrop')
  const fileNameEl = form.querySelector('#feedbackFileName')
  const fileHintEl = form.querySelector('#feedbackFileHint')
  const contactEl = form.querySelector('#feedbackContact')
  const honeyEl = form.querySelector('[name="_honey"]')
  const sendEl = form.querySelector('#feedbackSend')
  const statusEl = form.querySelector('#feedbackStatus')

  const setStatus = (text, isError = false) => {
    statusEl.textContent = text
    statusEl.classList.toggle('error', isError)
  }

  const showChosenFile = () => {
    const file = fileEl.files?.[0]
    fileNameEl.textContent = file ? file.name : 'Choose a picture or PDF'
    fileHintEl.textContent = file ? 'Click to choose a different file' : 'Optional'
  }

  panel.addEventListener('toggle', () => {
    if (panel.open) track('feedback-opened')
  })

  const clearStatus = () => setStatus('')

  blurbEl.addEventListener('input', clearStatus)
  contactEl.addEventListener('input', clearStatus)

  fileEl.addEventListener('change', () => {
    showChosenFile()
    clearStatus()
  })

  dropEl.addEventListener('dragover', (event) => {
    event.preventDefault()
    dropEl.classList.add('is-dragover')
  })

  dropEl.addEventListener('dragleave', () => {
    dropEl.classList.remove('is-dragover')
  })

  dropEl.addEventListener('drop', (event) => {
    event.preventDefault()
    dropEl.classList.remove('is-dragover')
    const file = event.dataTransfer?.files?.[0]
    if (!file) return
    const transfer = new DataTransfer()
    transfer.items.add(file)
    fileEl.files = transfer.files
    showChosenFile()
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    if (honeyEl.value.trim()) {
      form.reset()
      showChosenFile()
      setStatus('Sent.')
      return
    }

    const inspected = inspectFeedbackDraft({
      blurb: blurbEl.value,
      contact: contactEl.value,
      file: fileEl.files?.[0] || null,
    })
    if (!inspected.ok) {
      setStatus(inspected.error, true)
      return
    }

    sendEl.disabled = true
    setStatus('Sending…')

    try {
      await postFeedback(inspected.draft)
      form.reset()
      showChosenFile()
      track('feedback-sent')
      setStatus('Sent. It is on its way.')
    } catch (error) {
      track('feedback-error')
      setStatus(error instanceof Error ? error.message : 'Could not send.', true)
    } finally {
      sendEl.disabled = false
    }
  })
}
