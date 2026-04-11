import { FluidSim } from './fluid.js'
import { HandTracker } from './hand.js'

const canvas = document.getElementById('c')
const drawCanvas = document.getElementById('draw-canvas')
const drawCtx = drawCanvas.getContext('2d')
const statusEl = document.getElementById('status')
const videoEl = document.getElementById('camera-feed')
const drawBtn = document.getElementById('draw-btn')
const clearBtn = document.getElementById('clear-btn')
const clearFlashEl = document.getElementById('clear-flash')
const fingerCursor = document.getElementById('finger-cursor')

// ── Drawing mode toggle ───────────────────────────────────────────────────────
let drawMode = false

drawBtn.addEventListener('click', () => {
  drawMode = !drawMode
  drawBtn.classList.toggle('active', drawMode)
  drawBtn.textContent = drawMode ? '✏️ Drawing' : '✏️ Draw'
  clearBtn.style.display = drawMode ? 'block' : 'none'
  // Show crosshair cursor in draw mode so mouse position is visible
  canvas.style.cursor = drawMode ? 'crosshair' : 'none'
  if (!drawMode) {
    penPaths.clear()
    fingerCursor.style.display = 'none'
  }
})

clearBtn.addEventListener('click', clearAll)

// ── Canvas sizing ─────────────────────────────────────────────────────────────
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  canvas.width = Math.round(canvas.clientWidth * dpr)
  canvas.height = Math.round(canvas.clientHeight * dpr)
  drawCanvas.width = drawCanvas.clientWidth
  drawCanvas.height = drawCanvas.clientHeight
}
resizeCanvas()
window.addEventListener('resize', resizeCanvas)

// ── Fluid sim ─────────────────────────────────────────────────────────────────
const fluid = new FluidSim(canvas)

let pendingSplats = []

// ── Per-source bezier path buffers (draw mode) ────────────────────────────────
const penPaths = new Map()

function drawNormalPoint(sourceId, px, py) {
  if (!penPaths.has(sourceId)) penPaths.set(sourceId, [])
  const path = penPaths.get(sourceId)
  path.push({ x: px, y: py })
  if (path.length > 3) path.shift()

  drawCtx.strokeStyle = '#ffffff'
  drawCtx.lineWidth = 3
  drawCtx.lineCap = 'round'
  drawCtx.lineJoin = 'round'

  if (path.length === 2) {
    drawCtx.beginPath()
    drawCtx.moveTo(path[0].x, path[0].y)
    drawCtx.lineTo(path[1].x, path[1].y)
    drawCtx.stroke()
  } else if (path.length === 3) {
    const [p0, p1, p2] = path
    const mid01 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }
    const mid12 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
    drawCtx.beginPath()
    drawCtx.moveTo(mid01.x, mid01.y)
    drawCtx.quadraticCurveTo(p1.x, p1.y, mid12.x, mid12.y)
    drawCtx.stroke()
  }
}

// ── Clear ─────────────────────────────────────────────────────────────────────
let clearFlashTimer = null

function clearAll() {
  fluid.clear()
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height)
  penPaths.clear()

  clearFlashEl.style.transition = 'none'
  clearFlashEl.style.opacity = '1'
  if (clearFlashTimer) clearTimeout(clearFlashTimer)
  clearFlashTimer = setTimeout(() => {
    clearFlashEl.style.transition = 'opacity 0.5s'
    clearFlashEl.style.opacity = '0'
  }, 800)
}

// ── Hand tracker ──────────────────────────────────────────────────────────────
const tracker = new HandTracker({
  onResults(splats) { pendingSplats = splats },
  onGesture(gesture) { if (gesture.type === 'clear') clearAll() },
})

// ── Mouse fallback ────────────────────────────────────────────────────────────
let mousePos = null
let prevMousePos = null
let mouseDown = false

canvas.addEventListener('mousedown', () => { mouseDown = true })
canvas.addEventListener('mouseup', () => {
  mouseDown = false
  prevMousePos = null
  penPaths.delete('mouse')
})
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const y = 1 - (e.clientY - rect.top) / rect.height
  prevMousePos = mousePos
  mousePos = { x, y }
})
canvas.addEventListener('mouseleave', () => {
  mousePos = null
  prevMousePos = null
  penPaths.delete('mouse')
})

let hue = 0
let lastTime = performance.now()

// ── Render loop ───────────────────────────────────────────────────────────────
function loop(now) {
  requestAnimationFrame(loop)

  const dt = Math.min((now - lastTime) / 1000, 0.033)
  lastTime = now
  hue = (hue + 40 * dt) % 360

  const activeSourceIds = new Set()
  let latestHandSplat = null

  for (const s of pendingSplats) {
    if (s.sourceId) {
      activeSourceIds.add(s.sourceId)
      if (!latestHandSplat) latestHandSplat = s  // first hand = primary finger
    }

    if (drawMode) {
      const px = s.x * drawCanvas.width
      const py = (1 - s.y) * drawCanvas.height
      drawNormalPoint(s.sourceId, px, py)
    } else {
      fluid.splat(s.x, s.y, s.dx, s.dy, s.color)
    }
  }
  pendingSplats = []

  // Move finger-tip cursor dot to primary tracked finger
  if (drawMode && latestHandSplat) {
    fingerCursor.style.display = 'block'
    fingerCursor.style.left = (latestHandSplat.x * window.innerWidth) + 'px'
    fingerCursor.style.top = ((1 - latestHandSplat.y) * window.innerHeight) + 'px'
  } else {
    fingerCursor.style.display = 'none'
  }

  for (const id of penPaths.keys()) {
    if (id !== 'mouse' && !activeSourceIds.has(id)) penPaths.delete(id)
  }

  // Mouse
  if (drawMode) {
    if (mouseDown && mousePos) {
      const px = mousePos.x * drawCanvas.width
      const py = (1 - mousePos.y) * drawCanvas.height
      drawNormalPoint('mouse', px, py)
    } else if (!mouseDown) {
      penPaths.delete('mouse')
    }
  } else {
    if (mousePos && prevMousePos) {
      const dx = (mousePos.x - prevMousePos.x) / dt
      const dy = (mousePos.y - prevMousePos.y) / dt
      fluid.splat(mousePos.x, mousePos.y, dx * 0.15, dy * 0.15, hslToRgb(hue, 1, 0.6))
    }
  }

  prevMousePos = mousePos ? { ...mousePos } : null

  fluid.step(dt)
  fluid.render()
}

requestAnimationFrame(loop)

// ── Start hand tracking ───────────────────────────────────────────────────────
statusEl.textContent = 'requesting camera…'
tracker.init(videoEl).then(() => {
  statusEl.textContent = 'hands: tracking'
  setTimeout(() => { statusEl.style.opacity = '0' }, 3000)
}).catch((err) => {
  console.warn('Hand tracking unavailable:', err)
  statusEl.textContent = 'hand tracking unavailable — use mouse'
  setTimeout(() => { statusEl.style.opacity = '0' }, 4000)
})

function hslToRgb(h, s, l) {
  h = h / 360
  let r, g, b
  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1/3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1/3)
  }
  return [r, g, b]
}
