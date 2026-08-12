/** Tiny Tetris Easter egg — only runs when started, ignores keys while typing in form fields. */

const COLS = 10
const ROWS = 16
const CELL = 16

const SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
}

const COLORS = {
  I: '#2fbf71',
  O: '#111111',
  T: '#5c5c5c',
  S: '#2fbf71',
  Z: '#111111',
  J: '#737373',
  L: '#2fbf71',
}

const cloneMatrix = (matrix) => matrix.map((row) => [...row])

const rotateMatrix = (matrix) => {
  const rows = matrix.length
  const cols = matrix[0].length
  const next = Array.from({ length: cols }, () => Array(rows).fill(0))
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      next[c][rows - 1 - r] = matrix[r][c]
    }
  }
  return next
}

const isTypingTarget = (el) => {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export const mountMiniTetris = ({
  rootEl,
  canvasEl,
  scoreEl,
  startBtnEl,
  restartBtnEl,
  toggleEl,
}) => {
  if (!rootEl || !canvasEl) return { open() {}, close() {}, destroy() {} }

  let open = false

  const ctx = canvasEl.getContext('2d')
  canvasEl.width = COLS * CELL
  canvasEl.height = ROWS * CELL

  let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null))
  let piece = null
  let score = 0
  let running = false
  let gameOver = false
  let dropMs = 650
  let lastDrop = 0
  let rafId = 0

  const randomPiece = () => {
    const keys = Object.keys(SHAPES)
    const type = keys[Math.floor(Math.random() * keys.length)]
    const matrix = cloneMatrix(SHAPES[type])
    return {
      type,
      matrix,
      x: Math.floor((COLS - matrix[0].length) / 2),
      y: 0,
    }
  }

  const collides = (matrix, x, y) => {
    for (let r = 0; r < matrix.length; r += 1) {
      for (let c = 0; c < matrix[r].length; c += 1) {
        if (!matrix[r][c]) continue
        const nx = x + c
        const ny = y + r
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true
        if (ny >= 0 && board[ny][nx]) return true
      }
    }
    return false
  }

  const mergePiece = () => {
    for (let r = 0; r < piece.matrix.length; r += 1) {
      for (let c = 0; c < piece.matrix[r].length; c += 1) {
        if (!piece.matrix[r][c]) continue
        const ny = piece.y + r
        const nx = piece.x + c
        if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
          board[ny][nx] = piece.type
        }
      }
    }
  }

  const clearLines = () => {
    let cleared = 0
    board = board.filter((row) => {
      const full = row.every((cell) => cell)
      if (full) cleared += 1
      return !full
    })
    while (board.length < ROWS) board.unshift(Array(COLS).fill(null))
    if (cleared) {
      score += cleared * 10 * cleared
      if (scoreEl) scoreEl.textContent = String(score)
      dropMs = Math.max(280, 650 - Math.floor(score / 40) * 30)
    }
  }

  const spawn = () => {
    piece = randomPiece()
    if (collides(piece.matrix, piece.x, piece.y)) {
      running = false
      gameOver = true
      if (startBtnEl) startBtnEl.textContent = 'Play again'
    }
  }

  const reset = () => {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null))
    score = 0
    dropMs = 650
    gameOver = false
    if (scoreEl) scoreEl.textContent = '0'
    spawn()
  }

  const move = (dx, dy) => {
    if (!piece || !running) return false
    const nx = piece.x + dx
    const ny = piece.y + dy
    if (collides(piece.matrix, nx, ny)) return false
    piece.x = nx
    piece.y = ny
    return true
  }

  const rotate = () => {
    if (!piece || !running) return
    const next = rotateMatrix(piece.matrix)
    const kicks = [0, -1, 1, -2, 2]
    for (const kick of kicks) {
      if (!collides(next, piece.x + kick, piece.y)) {
        piece.matrix = next
        piece.x += kick
        return
      }
    }
  }

  const hardDrop = () => {
    if (!piece || !running) return
    while (move(0, 1)) {
      /* fall */
    }
    mergePiece()
    clearLines()
    spawn()
  }

  const tickDrop = () => {
    if (!move(0, 1)) {
      mergePiece()
      clearLines()
      spawn()
    }
  }

  const drawCell = (x, y, color) => {
    ctx.fillStyle = color
    ctx.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1)
  }

  const drawGhostCell = (x, y, color) => {
    const px = x * CELL
    const py = y * CELL
    const size = CELL - 1
    ctx.fillStyle = color
    ctx.globalAlpha = 0.18
    ctx.fillRect(px, py, size, size)
    ctx.globalAlpha = 1
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.strokeRect(px + 1, py + 1, size - 2, size - 2)
  }

  const ghostY = () => {
    if (!piece) return null
    let y = piece.y
    while (!collides(piece.matrix, piece.x, y + 1)) y += 1
    return y
  }

  const draw = () => {
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height)
    ctx.strokeStyle = '#ececec'
    ctx.strokeRect(0.5, 0.5, canvasEl.width - 1, canvasEl.height - 1)

    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (board[r][c]) drawCell(c, r, COLORS[board[r][c]] || '#111')
      }
    }

    if (piece && !gameOver) {
      const dropY = ghostY()
      const color = COLORS[piece.type] || '#111'
      if (dropY !== null && dropY !== piece.y) {
        for (let r = 0; r < piece.matrix.length; r += 1) {
          for (let c = 0; c < piece.matrix[r].length; c += 1) {
            if (!piece.matrix[r][c]) continue
            drawGhostCell(piece.x + c, dropY + r, color)
          }
        }
      }

      for (let r = 0; r < piece.matrix.length; r += 1) {
        for (let c = 0; c < piece.matrix[r].length; c += 1) {
          if (!piece.matrix[r][c]) continue
          drawCell(piece.x + c, piece.y + r, color)
        }
      }
    }

    if (gameOver) {
      ctx.fillStyle = 'rgba(255,255,255,0.72)'
      ctx.fillRect(0, canvasEl.height / 2 - 14, canvasEl.width, 28)
      ctx.fillStyle = '#111'
      ctx.font = '14px ui-monospace, Menlo, monospace'
      ctx.textAlign = 'center'
      ctx.fillText('nice break', canvasEl.width / 2, canvasEl.height / 2 + 4)
    }
  }

  const loop = (time) => {
    if (running && time - lastDrop >= dropMs) {
      tickDrop()
      lastDrop = time
    }
    draw()
    rafId = requestAnimationFrame(loop)
  }

  const start = () => {
    reset()
    running = true
    gameOver = false
    lastDrop = performance.now()
    if (startBtnEl) startBtnEl.textContent = 'Pause'
    canvasEl.focus({ preventScroll: true })
  }

  const toggle = () => {
    if (gameOver || !piece) {
      start()
      return
    }
    running = !running
    if (startBtnEl) startBtnEl.textContent = running ? 'Pause' : 'Resume'
    if (running) canvasEl.focus({ preventScroll: true })
  }

  const onKey = (event) => {
    if (!open) return
    if (isTypingTarget(document.activeElement)) return
    if (!running && event.key !== 'Enter' && event.key !== 'ArrowUp') return

    const key = event.key
    if (
      key === 'ArrowLeft' ||
      key === 'ArrowRight' ||
      key === 'ArrowDown' ||
      key === 'ArrowUp' ||
      key === ' ' ||
      key === 'Enter'
    ) {
      event.preventDefault()
    }

    if (!running) {
      if (key === 'Enter' || key === 'ArrowUp') start()
      return
    }

    if (key === 'ArrowLeft') move(-1, 0)
    else if (key === 'ArrowRight') move(1, 0)
    else if (key === 'ArrowDown') move(0, 1)
    else if (key === ' ') rotate()
    else if (key === 'ArrowUp' || key === 'Enter') hardDrop()
  }

  const onPadAction = (action) => {
    if (!open) return
    if (!running) {
      if (action === 'hard' || action === 'rotate') start()
      return
    }
    if (action === 'left') move(-1, 0)
    else if (action === 'right') move(1, 0)
    else if (action === 'soft') move(0, 1)
    else if (action === 'rotate') rotate()
    else if (action === 'hard') hardDrop()
  }

  const setOpen = (nextOpen) => {
    open = nextOpen
    rootEl.classList.toggle('is-collapsed', !open)
    rootEl.hidden = !open
    if (toggleEl) {
      toggleEl.setAttribute('aria-expanded', open ? 'true' : 'false')
      toggleEl.textContent = open ? 'Get Back to Work' : 'Take a Break'
    }
    if (!open) {
      running = false
      if (startBtnEl) startBtnEl.textContent = 'Play'
    }
  }

  startBtnEl?.addEventListener('click', toggle)
  restartBtnEl?.addEventListener('click', start)
  toggleEl?.addEventListener('click', () => setOpen(!open))
  canvasEl.addEventListener('click', () => {
    if (!running || gameOver) start()
    else canvasEl.focus({ preventScroll: true })
  })
  rootEl.querySelectorAll('[data-tetris]').forEach((btn) => {
    btn.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      event.preventDefault()
      onPadAction(btn.getAttribute('data-tetris'))
    })
    btn.addEventListener('click', (event) => event.preventDefault())
  })
  window.addEventListener('keydown', onKey)

  rafId = requestAnimationFrame(loop)
  draw()

  return {
    open() {
      setOpen(true)
    },
    close() {
      setOpen(false)
    },
    destroy() {
      cancelAnimationFrame(rafId)
      window.removeEventListener('keydown', onKey)
    },
  }
}
