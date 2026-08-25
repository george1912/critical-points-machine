/** Tiny Tetris leaderboard — local top scores with anti-cheat + name filters. */

const STORAGE_KEY = 'stg-tiny-tetris-board-v1'
const MAX_ENTRIES = 10
const MAX_SCORE = 4000
const MIN_SCORE = 10
const MIN_NAME = 2
const MAX_NAME = 12
const MIN_MS_PER_POINT = 35
const MAX_SUBMITS_PER_HOUR = 20
const SALT = 'stg-tiny-tetris-v1-break-board'

const BLOCKED_NAMES = [
  'admin',
  'ass',
  'asshole',
  'bastard',
  'bitch',
  'bollocks',
  'cock',
  'crap',
  'cunt',
  'damn',
  'dick',
  'fag',
  'faggot',
  'fuck',
  'fucker',
  'fucking',
  'goddamn',
  'hell',
  'idiot',
  'jesus',
  'motherfucker',
  'nazi',
  'nigga',
  'nigger',
  'piss',
  'porn',
  'pussy',
  'rape',
  'sex',
  'shit',
  'slut',
  'tit',
  'twat',
  'whore',
]

const normalizeName = (raw) =>
  String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_NAME)

const nameKey = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

const isNameBlocked = (name) => {
  const key = nameKey(name)
  if (!key) return true
  return BLOCKED_NAMES.some((word) => key.includes(word))
}

const isNameAllowed = (name) => {
  if (name.length < MIN_NAME || name.length > MAX_NAME) return false
  if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/.test(name)) return false
  if (isNameBlocked(name)) return false
  return true
}

const hashTicket = (parts) => {
  const raw = `${SALT}|${parts.join('|')}`
  let h = 2166136261
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

export const sealPlayTicket = ({
  score,
  linesCleared,
  piecesPlaced,
  activeMs,
  clearPoints,
  nonce,
}) => {
  const issuedAt = Date.now()
  const payload = {
    score: Number(score) || 0,
    linesCleared: Number(linesCleared) || 0,
    piecesPlaced: Number(piecesPlaced) || 0,
    activeMs: Math.max(0, Math.floor(Number(activeMs) || 0)),
    clearPoints: Number(clearPoints) || 0,
    nonce: String(nonce || ''),
    issuedAt,
  }
  payload.sig = hashTicket([
    payload.score,
    payload.linesCleared,
    payload.piecesPlaced,
    payload.activeMs,
    payload.clearPoints,
    payload.nonce,
    payload.issuedAt,
  ])
  return payload
}

const readBoard = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (row) =>
          row &&
          typeof row.name === 'string' &&
          Number.isFinite(row.score) &&
          row.score >= MIN_SCORE &&
          row.score <= MAX_SCORE,
      )
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

const writeBoard = (rows) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, MAX_ENTRIES)))
}

const recentSubmitCount = (board) => {
  const hourAgo = Date.now() - 60 * 60 * 1000
  return board.filter((row) => row.at >= hourAgo).length
}

export const validatePlayTicket = (ticket) => {
  if (!ticket || typeof ticket !== 'object') return 'Missing play session.'
  const {
    score,
    linesCleared,
    piecesPlaced,
    activeMs,
    clearPoints,
    nonce,
    issuedAt,
    sig,
  } = ticket

  if (!Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE) {
    return 'Score out of range.'
  }
  if (!Number.isInteger(linesCleared) || linesCleared < 1 || linesCleared > 400) {
    return 'Invalid line count.'
  }
  if (!Number.isInteger(piecesPlaced) || piecesPlaced < 1 || piecesPlaced > 2000) {
    return 'Invalid piece count.'
  }
  if (!Number.isFinite(activeMs) || activeMs < 4_000) {
    return 'Play a bit longer first.'
  }
  if (score !== clearPoints) return 'Score did not match play session.'
  if (linesCleared > piecesPlaced * 4) return 'Impossible clear rate.'
  if (activeMs < score * MIN_MS_PER_POINT) return 'Score rose too fast to count.'
  if (Date.now() - issuedAt > 5 * 60 * 1000) return 'Session expired — play again.'
  if (Date.now() - issuedAt < 0) return 'Invalid session time.'
  if (!nonce || String(nonce).length < 8) return 'Invalid session.'

  const expected = hashTicket([
    score,
    linesCleared,
    piecesPlaced,
    activeMs,
    clearPoints,
    nonce,
    issuedAt,
  ])
  if (sig !== expected) return 'Tampered score rejected.'
  return null
}

export const submitScore = (nameInput, ticket) => {
  const ticketError = validatePlayTicket(ticket)
  if (ticketError) return { ok: false, error: ticketError }

  const name = normalizeName(nameInput)
  if (!isNameAllowed(name)) {
    return {
      ok: false,
      error: 'Pick a clean name (2–12 letters/numbers).',
    }
  }

  const board = readBoard()
  if (recentSubmitCount(board) >= MAX_SUBMITS_PER_HOUR) {
    return { ok: false, error: 'Slow down — try again later.' }
  }

  const usedNonces = new Set(board.map((row) => row.nonce).filter(Boolean))
  if (usedNonces.has(ticket.nonce)) {
    return { ok: false, error: 'That run was already submitted.' }
  }

  const lowest = board.length >= MAX_ENTRIES ? board[board.length - 1].score : 0
  if (board.length >= MAX_ENTRIES && ticket.score <= lowest) {
    return { ok: false, error: 'Not quite high enough for the board.' }
  }

  const next = [
    ...board,
    {
      name,
      score: ticket.score,
      at: Date.now(),
      nonce: ticket.nonce,
      lines: ticket.linesCleared,
    },
  ]
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, MAX_ENTRIES)

  writeBoard(next)
  return { ok: true, board: next, rank: next.findIndex((row) => row.nonce === ticket.nonce) + 1 }
}

export const getLeaderboard = () => readBoard()

export const qualifiesForBoard = (score) => {
  if (!Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE) return false
  const board = readBoard()
  if (board.length < MAX_ENTRIES) return true
  return score > board[board.length - 1].score
}

export const renderLeaderboard = (listEl) => {
  if (!listEl) return
  const board = readBoard()
  if (!board.length) {
    listEl.innerHTML = `<li class="stg-board-empty">No scores yet — clear a few lines.</li>`
    return
  }
  listEl.innerHTML = board
    .map(
      (row, index) => `
      <li>
        <span class="stg-board-rank">${index + 1}</span>
        <span class="stg-board-name">${escapeHtml(row.name)}</span>
        <span class="stg-board-score">${row.score}</span>
      </li>`,
    )
    .join('')
}

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
