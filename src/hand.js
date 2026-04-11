// hand.js — MediaPipe Hands tracker
// Loaded via CDN in index.html; window.Hands, window.Camera are globals

export class HandTracker {
  constructor({ onResults, onGesture }) {
    this._onResults = onResults
    this._onGesture = onGesture || null
    this._prev = {} // map: handIndex -> { x, y }
    this._hues = [0, 200] // starting hues for each hand
    this._hueSpeed = 40  // degrees per second
    this._lastTime = performance.now()
    this._ready = false
    this._video = null
    this._camera = null
    this._clearGestureStart = null
    this._clearGestureFired = false
  }

  // displayVideoEl: optional visible <video> to mirror the stream into for the toggle UI
  async init(displayVideoEl) {
    // Always create a dedicated hidden video for MediaPipe — it's picky about its element
    const video = document.createElement('video')
    video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;'
    video.setAttribute('playsinline', '')
    video.setAttribute('muted', '')
    document.body.appendChild(video)
    this._video = video
    this._displayVideo = displayVideoEl || null

    // Wait for MediaPipe globals
    await this._waitForMediaPipe()

    const hands = new window.Hands({
      locateFile: (f) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
    })

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    })

    hands.onResults((results) => this._handleResults(results))
    this._hands = hands

    // Use MediaPipe Camera utility
    const camera = new window.Camera(video, {
      onFrame: async () => {
        await hands.send({ image: video })
      },
      width: 320,
      height: 240,
    })
    this._camera = camera
    await camera.start()

    // Mirror the live stream to the display video so main.js can show/hide it
    if (this._displayVideo && this._video.srcObject) {
      this._displayVideo.srcObject = this._video.srcObject
    }

    this._ready = true
  }

  _waitForMediaPipe() {
    return new Promise((resolve) => {
      const check = () => {
        if (window.Hands && window.Camera) resolve()
        else setTimeout(check, 50)
      }
      check()
    })
  }

  _handleResults(results) {
    const now = performance.now()
    const dt = Math.min((now - this._lastTime) / 1000, 0.1)
    this._lastTime = now

    // Advance hues
    for (let i = 0; i < 2; i++) {
      this._hues[i] = (this._hues[i] + this._hueSpeed * dt) % 360
    }

    const splats = []

    if (!results.multiHandLandmarks) {
      this._prev = {}
      this._onResults(splats)
      return
    }

    results.multiHandLandmarks.forEach((landmarks, idx) => {
      // Index fingertip only (landmark 8)
      const tips = [landmarks[8]]

      tips.forEach((lm, tipIdx) => {
        const handKey = `${idx}_${tipIdx}`
        // MediaPipe gives x/y in 0..1, mirrored horizontally
        // Flip both: x to mirror, y because MediaPipe y=0 is top but WebGL UV y=0 is bottom
        const x = 1 - lm.x
        const y = 1 - lm.y

        const prev = this._prev[handKey]
        let vx = 0, vy = 0
        if (prev) {
          vx = (x - prev.x) / dt
          vy = (y - prev.y) / dt
        }
        this._prev[handKey] = { x, y }

        const speed = Math.sqrt(vx * vx + vy * vy)
        const baseHue = (this._hues[idx] + tipIdx * 30) % 360
        const color = hslToRgb(baseHue, 1.0, 0.65)

        // Force proportional to speed, with ambient minimum
        const force = Math.max(speed * 0.08, 0.004)

        splats.push({ sourceId: handKey, x, y, dx: vx * 0.15, dy: vy * 0.15, color, force })
      })
    })

    // Clean up stale hand keys
    const activeKeys = new Set()
    if (results.multiHandLandmarks) {
      results.multiHandLandmarks.forEach((_, idx) => {
        activeKeys.add(`${idx}_0`)
      })
    }
    for (const k of Object.keys(this._prev)) {
      if (!activeKeys.has(k)) delete this._prev[k]
    }

    // ── Clear gesture: all 10 fingers extended for 500 ms ────────
    if (this._onGesture) {
      const hands = results.multiHandLandmarks
      const allOpen = hands && hands.length === 2 &&
        hands.every(lm => this._allFingersExtended(lm))

      if (allOpen) {
        if (this._clearGestureStart === null) {
          this._clearGestureStart = now
          this._clearGestureFired = false
        } else if (!this._clearGestureFired && now - this._clearGestureStart >= 500) {
          this._onGesture({ type: 'clear' })
          this._clearGestureFired = true
        }
      } else {
        this._clearGestureStart = null
        this._clearGestureFired = false
      }
    }

    this._onResults(splats)
  }

  // Returns true when all 5 fingers are visibly extended on a hand.
  // Uses MediaPipe's coordinate system where y=0 is the top of the frame.
  _allFingersExtended(lm) {
    const up = (tip, pip) => lm[tip].y < lm[pip].y
    return (
      up(8,  6)  &&  // index
      up(12, 10) &&  // middle
      up(16, 14) &&  // ring
      up(20, 18) &&  // pinky
      lm[4].y < lm[3].y  // thumb tip above IP joint
    )
  }

  isReady() { return this._ready }
}

// HSL → RGB, all in [0,1]
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
