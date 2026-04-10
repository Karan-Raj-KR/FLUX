import { FluidSim } from './fluid.js'
import { HandTracker } from './hand.js'

const canvas = document.getElementById('c')
const statusEl = document.getElementById('status')
const videoEl = document.getElementById('camera-feed')
const toggleBtn = document.getElementById('toggle-btn')

// Camera toggle
let cameraVisible = false
toggleBtn.addEventListener('click', () => {
  cameraVisible = !cameraVisible
  videoEl.style.display = cameraVisible ? 'block' : 'none'
  canvas.classList.toggle('camera-on', cameraVisible)
  toggleBtn.textContent = cameraVisible ? '⬛ Hide Camera' : '📷 Show Camera'
  toggleBtn.classList.toggle('active', cameraVisible)
})

// Match canvas to CSS size (devicePixelRatio capped at 1.5 for perf)
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  canvas.width = Math.round(canvas.clientWidth * dpr)
  canvas.height = Math.round(canvas.clientHeight * dpr)
}
resizeCanvas()
window.addEventListener('resize', resizeCanvas)

// Init fluid sim
const fluid = new FluidSim(canvas)

// Pending splats from hand tracker
let pendingSplats = []

// Hand tracker
const tracker = new HandTracker({
  onResults(splats) {
    pendingSplats = splats
  },
})

// Mouse/touch fallback (demo without camera)
let mousePos = null
let prevMousePos = null

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  // Flip Y: screen y=0 is top, WebGL UV y=0 is bottom
  const y = 1 - (e.clientY - rect.top) / rect.height
  prevMousePos = mousePos
  mousePos = { x, y }
})
canvas.addEventListener('mouseleave', () => { mousePos = null; prevMousePos = null })

let hue = 0

// Render loop
let lastTime = performance.now()

function loop(now) {
  requestAnimationFrame(loop)

  const dt = Math.min((now - lastTime) / 1000, 0.033) // cap at 33ms
  lastTime = now

  hue = (hue + 40 * dt) % 360

  // Apply hand splats
  for (const s of pendingSplats) {
    fluid.splat(s.x, s.y, s.dx, s.dy, s.color)
  }
  pendingSplats = []

  // Mouse fallback splat
  if (mousePos && prevMousePos) {
    const dx = (mousePos.x - prevMousePos.x) / dt
    const dy = (mousePos.y - prevMousePos.y) / dt
    const color = hslToRgb(hue, 1, 0.6)
    fluid.splat(mousePos.x, mousePos.y, dx * 0.15, dy * 0.15, color)
  }
  prevMousePos = mousePos ? { ...mousePos } : null

  fluid.step(dt)
  fluid.render()
}

requestAnimationFrame(loop)

// Start hand tracking — pass the visible video element so we can show/hide it
statusEl.textContent = 'requesting camera…'
tracker.init(videoEl).then(() => {
  statusEl.textContent = 'hands: tracking'
  setTimeout(() => { statusEl.style.opacity = '0' }, 3000)
}).catch((err) => {
  console.warn('Hand tracking unavailable:', err)
  statusEl.textContent = 'hand tracking unavailable — use mouse'
  setTimeout(() => { statusEl.style.opacity = '0' }, 4000)
})

// Utility
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
