/** Tiny Tetris leaderboard — local scores with consistency checks and name filters. */

const STORAGE_KEY = 'stg-tiny-tetris-board-v1'
const MAX_ENTRIES = 10
const MAX_SCORE = 4000
const MIN_SCORE = 10
const INITIAL_COUNT = 3
const MIN_MS_PER_POINT = 35
const MAX_SUBMITS_PER_HOUR = 20
const MAX_SESSION_MS = 24 * 60 * 60 * 1000
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

const normalizeName = (raw) => String(raw || '').toUpperCase().replace(/[^A-Z]/g, '')

export const formatInitials = (name) => {
  const letters = normalizeName(name).slice(0, INITIAL_COUNT)
  if (!letters) return ''
  return `${letters.split('').join('.')}.`
}

const nameKey = (name) => name.toLowerCase()

const isNameBlocked = (name) => {
  const key = nameKey(name)
  if (!key) return true
  return BLOCKED_NAMES.some((word) => key.includes(word))
}

const isNameAllowed = (name) => name.length === INITIAL_COUNT && !isNameBlocked(name)

const hashTicket = (parts) => {
  // A client-side checksum catches accidental edits; it is not server-side anti-cheat.
  const raw = `${SALT}|${parts.join('|')}`
  let h = 2166136261
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
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
    const now = Date.now()
    return parsed
      .filter(
        (row) =>
          row &&
          typeof row.name === 'string' &&
          isNameAllowed(row.name) &&
          Number.isFinite(row.score) &&
          Number.isInteger(row.score) &&
          row.score >= MIN_SCORE &&
          row.score <= MAX_SCORE &&
          Number.isFinite(row.at) &&
          row.at > 0 &&
          row.at <= now &&
          typeof row.nonce === 'string' &&
          /^[a-f0-9]{24}$/i.test(row.nonce) &&
          Number.isInteger(row.lines) &&
          row.lines >= 1 &&
          row.lines <= 400,
      )
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .slice(0, MAX_ENTRIES)
  } catch (error) {
    console.warn(
      '[Tetris leaderboard] Could not read saved scores:',
      error instanceof Error ? error.name : 'Unknown error',
    )
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
  if (!ticket || typeof ticket !== 'object' || Array.isArray(ticket)) {
    return 'Missing play session.'
  }
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
  if (activeMs > MAX_SESSION_MS) return 'Invalid play duration.'
  if (score !== clearPoints) return 'Score did not match play session.'
  if (linesCleared > piecesPlaced * 4) return 'Impossible clear rate.'
  if (activeMs < score * MIN_MS_PER_POINT) return 'Score rose too fast to count.'
  if (!Number.isInteger(issuedAt)) return 'Invalid session time.'
  const ticketAge = Date.now() - issuedAt
  if (ticketAge > 5 * 60 * 1000) return 'Session expired — play again.'
  if (ticketAge < 0) return 'Invalid session time.'
  if (typeof nonce !== 'string' || !/^[a-f0-9]{24}$/i.test(nonce)) {
    return 'Invalid session.'
  }
  if (typeof sig !== 'string' || !/^[a-f0-9]{8}$/i.test(sig)) {
    return 'Could not verify play session.'
  }

  const expected = hashTicket([
    score,
    linesCleared,
    piecesPlaced,
    activeMs,
    clearPoints,
    nonce,
    issuedAt,
  ])
  if (sig !== expected) return 'Could not verify play session.'
  return null
}

export const submitScore = (nameInput, ticket) => {
  const ticketError = validatePlayTicket(ticket)
  if (ticketError) return { ok: false, error: ticketError }

  const name = normalizeName(nameInput)
  if (!isNameAllowed(name)) {
    return {
      ok: false,
      error: isNameBlocked(name) && name.length === INITIAL_COUNT
        ? 'Try three other letters.'
        : 'Use three letters.',
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

  try {
    writeBoard(next)
  } catch (error) {
    console.warn(
      '[Tetris leaderboard] Could not save scores:',
      error instanceof Error ? error.name : 'Unknown error',
    )
    return { ok: false, error: 'Could not save scores. Browser storage is unavailable.' }
  }
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
  const fragment = document.createDocumentFragment()
  if (board.length) {
    board.forEach((row, index) => {
      const item = document.createElement('li')
      const rank = document.createElement('span')
      rank.className = 'stg-board-rank'
      rank.textContent = String(index + 1)
      const name = document.createElement('span')
      name.className = 'stg-board-name'
      name.setAttribute('aria-label', formatInitials(row.name))
      formatInitials(row.name)
        .replace(/\.$/, '')
        .split('.')
        .forEach((letter, index, letters) => {
          const glyph = document.createElement('span')
          glyph.textContent = letter
          name.append(glyph)
          if (index < letters.length - 1) {
            const dot = document.createElement('span')
            dot.className = 'stg-board-dot'
            dot.setAttribute('aria-hidden', 'true')
            name.append(dot)
          }
        })
      const score = document.createElement('span')
      score.className = 'stg-board-score'
      score.textContent = String(row.score)
      item.append(rank, name, score)
      fragment.append(item)
    })
  }
  listEl.replaceChildren(fragment)
}
