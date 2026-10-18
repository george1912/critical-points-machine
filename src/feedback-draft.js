export const FEEDBACK_RECIPIENT = 'george.ulloa@downstate.edu'
export const MAX_FEEDBACK_BLURB_LENGTH = 4000
export const MAX_FEEDBACK_CONTACT_LENGTH = 200
export const MAX_FEEDBACK_FILE_BYTES = 8 * 1024 * 1024

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/x-pdf',
])

export const isAllowedFeedbackFile = (file) => {
  const type = String(file?.type || '').toLowerCase()
  if (type) return ALLOWED_TYPES.has(type)
  const ext = String(file?.name || '')
    .toLowerCase()
    .split('.')
    .pop()
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'heif', 'pdf'].includes(ext || '')
}

export const contactLooksLikeEmail = (contact) => EMAIL_PATTERN.test(String(contact || '').trim())

export const inspectFeedbackDraft = ({ blurb = '', contact = '', file = null } = {}) => {
  const cleanBlurb = String(blurb).trim()
  const cleanContact = String(contact).trim()

  if (!cleanBlurb && !file) {
    return { ok: false, error: 'Write a blurb, or attach a picture or PDF.' }
  }
  if (cleanBlurb.length > MAX_FEEDBACK_BLURB_LENGTH) {
    return { ok: false, error: 'That blurb is too long.' }
  }
  if (cleanContact.length > MAX_FEEDBACK_CONTACT_LENGTH) {
    return { ok: false, error: 'Keep the email shorter.' }
  }
  if (file) {
    const size = file.size ?? file.bytes?.length ?? 0
    if (size > MAX_FEEDBACK_FILE_BYTES) {
      return { ok: false, error: 'That file is over 8 MB. Send a smaller picture or PDF.' }
    }
    if (!isAllowedFeedbackFile(file)) {
      return { ok: false, error: 'Attach a picture or a PDF.' }
    }
  }

  return {
    ok: true,
    draft: {
      blurb: cleanBlurb,
      contact: cleanContact,
      file,
    },
  }
}
