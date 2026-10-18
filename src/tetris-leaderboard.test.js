import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'

import {
  formatInitials,
  getLeaderboard,
  sealPlayTicket,
  submitScore,
  validatePlayTicket,
} from './tetris-leaderboard.js'

const STORAGE_KEY = 'stg-tiny-tetris-board-v1'

class MemoryStorage {
  values = new Map()

  getItem(key) {
    return this.values.get(key) ?? null
  }

  setItem(key, value) {
    this.values.set(key, String(value))
  }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage()
})

afterEach(() => {
  delete globalThis.localStorage
})

const validTicket = () =>
  sealPlayTicket({
    score: 10,
    linesCleared: 1,
    piecesPlaced: 4,
    activeMs: 4_000,
    clearPoints: 10,
    nonce: '0123456789abcdef01234567',
  })

test('accepts a valid play ticket and saves a score', () => {
  const ticket = validTicket()

  assert.equal(validatePlayTicket(ticket), null)
  const result = submitScore('may', ticket)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.rank, 1)
  assert.equal(result.board.length, 1)
  assert.equal(result.board[0].name, 'MAY')
  assert.equal(result.board[0].score, 10)
  assert.equal(result.board[0].nonce, ticket.nonce)
  assert.equal(result.board[0].lines, 1)
  assert.equal(Number.isFinite(result.board[0].at), true)
})

test('initials show a period after each letter', () => {
  assert.equal(formatInitials('may'), 'M.A.Y.')
})

test('nicknames are rejected', () => {
  const result = submitScore('Maya', validTicket())
  assert.equal(result.ok, false)
  assert.equal(result.error, 'Use three letters.')
})

test('rejects tickets with malformed timestamps, signatures, or nonces', () => {
  const malformedTime = validTicket()
  malformedTime.issuedAt = Number.NaN
  assert.equal(validatePlayTicket(malformedTime), 'Invalid session time.')

  const malformedSignature = validTicket()
  malformedSignature.sig = '<invalid>'
  assert.equal(validatePlayTicket(malformedSignature), 'Could not verify play session.')

  const malformedNonce = validTicket()
  malformedNonce.nonce = 'short'
  assert.equal(validatePlayTicket(malformedNonce), 'Invalid session.')
})

test('ignores malformed or unsafe entries in persisted board data', () => {
  globalThis.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([
      {
        name: 'MAY',
        score: 20,
        at: Date.now() - 1000,
        nonce: '0123456789abcdef01234567',
        lines: 2,
      },
      {
        name: '<img src=x onerror=alert(1)>',
        score: 4000,
        at: Date.now(),
        nonce: 'abcdefabcdefabcdefabcdef',
        lines: 1,
      },
      {
        name: 'Rin',
        score: 3000,
        at: Number.NaN,
        nonce: 'abcdefabcdefabcdefabcdef',
        lines: 1,
      },
    ]),
  )

  assert.deepEqual(getLeaderboard().map(({ name, score }) => ({ name, score })), [
    { name: 'MAY', score: 20 },
  ])
})

test('reports when browser storage prevents saving a score', () => {
  globalThis.localStorage.setItem = () => {
    throw new Error('storage disabled')
  }

  const originalWarn = console.warn
  console.warn = () => {}
  try {
    assert.deepEqual(submitScore('MAY', validTicket()), {
      ok: false,
      error: 'Could not save scores. Browser storage is unavailable.',
    })
  } finally {
    console.warn = originalWarn
  }
})
