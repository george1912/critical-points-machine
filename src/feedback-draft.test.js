import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectFeedbackDraft } from './feedback-draft.js'

test('a blurb can be sent with no contact and no file', () => {
  const result = inspectFeedbackDraft({ blurb: 'The last line was cut off.', contact: '', file: null })
  assert.equal(result.ok, true)
  assert.equal(result.draft.contact, '')
  assert.equal(result.draft.file, null)
})

test('a picture or pdf can be sent with no blurb', () => {
  const picture = inspectFeedbackDraft({
    blurb: '  ',
    contact: '',
    file: { name: 'box.jpg', type: 'image/jpeg', size: 1200 },
  })
  assert.equal(picture.ok, true)

  const pdf = inspectFeedbackDraft({
    blurb: '',
    contact: 'student@example.com',
    file: { name: 'worksheet.pdf', type: 'application/pdf', size: 5000 },
  })
  assert.equal(pdf.ok, true)
  assert.equal(pdf.draft.contact, 'student@example.com')
})

test('contact info is optional and can be a phone number', () => {
  const result = inspectFeedbackDraft({ blurb: 'Hello', contact: '718-555-0100', file: null })
  assert.equal(result.ok, true)
  assert.equal(result.draft.contact, '718-555-0100')
})

test('an empty send is rejected', () => {
  const result = inspectFeedbackDraft({ blurb: '   ', contact: '', file: null })
  assert.equal(result.ok, false)
  assert.match(result.error, /blurb|picture|PDF/i)
})

test('other file types and oversized files are rejected', () => {
  assert.equal(
    inspectFeedbackDraft({
      blurb: 'hi',
      file: { name: 'notes.txt', type: 'text/plain', size: 10 },
    }).ok,
    false,
  )
  assert.match(
    inspectFeedbackDraft({
      blurb: '',
      file: { name: 'huge.png', type: 'image/png', size: 8 * 1024 * 1024 + 1 },
    }).error,
    /8 MB/,
  )
})
