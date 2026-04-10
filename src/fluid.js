import advectSrc from './shaders/advect.glsl?raw'
import divergenceSrc from './shaders/divergence.glsl?raw'
import pressureSrc from './shaders/pressure.glsl?raw'
import gradientSrc from './shaders/gradient.glsl?raw'
import curlSrc from './shaders/curl.glsl?raw'
import vorticitySrc from './shaders/vorticity.glsl?raw'
import splatSrc from './shaders/splat.glsl?raw'
import displaySrc from './shaders/display.glsl?raw'
import bloomPrefilterSrc from './shaders/bloom_prefilter.glsl?raw'
import bloomBlurSrc from './shaders/bloom_blur.glsl?raw'

const VERT_SRC = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

const CONFIG = {
  SIM_RESOLUTION: 128,
  DYE_RESOLUTION: 512,
  PRESSURE_ITERATIONS: 25,
  VELOCITY_DISSIPATION: 0.98,
  DENSITY_DISSIPATION: 0.975,
  CURL_STRENGTH: 28.0,
  SPLAT_RADIUS: 0.18,
  BLOOM_THRESHOLD: 0.4,
  BLOOM_INTENSITY: 0.8,
  BLOOM_RESOLUTION: 256,
}

function compileShader(gl, type, src) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error('Shader compile error: ' + gl.getShaderInfoLog(shader) + '\n\nSource:\n' + src)
  }
  return shader
}

function createProgram(gl, fragSrc) {
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc)
  const prog = gl.createProgram()
  gl.attachShader(prog, vert)
  gl.attachShader(prog, frag)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Program link error: ' + gl.getProgramInfoLog(prog))
  }
  // Cache uniform locations
  const uniforms = {}
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS)
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(prog, i)
    uniforms[info.name] = gl.getUniformLocation(prog, info.name)
  }
  return { prog, uniforms }
}

function createFBO(gl, w, h, internalFormat, format, type, filter) {
  gl.activeTexture(gl.TEXTURE0)
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null)

  const fbo = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.viewport(0, 0, w, h)
  gl.clear(gl.COLOR_BUFFER_BIT)

  return { tex, fbo, width: w, height: h }
}

function createDoubleFBO(gl, w, h, internalFormat, format, type, filter) {
  let fbo1 = createFBO(gl, w, h, internalFormat, format, type, filter)
  let fbo2 = createFBO(gl, w, h, internalFormat, format, type, filter)
  return {
    width: w, height: h,
    get read() { return fbo1 },
    get write() { return fbo2 },
    swap() { [fbo1, fbo2] = [fbo2, fbo1] },
  }
}

export class FluidSim {
  constructor(canvas) {
    this.canvas = canvas
    this.gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    })
    if (!this.gl) throw new Error('WebGL2 not supported')

    this._init()
  }

  _init() {
    const gl = this.gl

    // Enable float texture filtering
    gl.getExtension('EXT_color_buffer_float')
    gl.getExtension('OES_texture_float_linear')

    // Full-screen quad
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.vao = vao

    // Compile programs
    this.programs = {
      advect: createProgram(gl, advectSrc),
      divergence: createProgram(gl, divergenceSrc),
      pressure: createProgram(gl, pressureSrc),
      gradient: createProgram(gl, gradientSrc),
      curl: createProgram(gl, curlSrc),
      vorticity: createProgram(gl, vorticitySrc),
      splat: createProgram(gl, splatSrc),
      display: createProgram(gl, displaySrc),
      bloomPrefilter: createProgram(gl, bloomPrefilterSrc),
      bloomBlur: createProgram(gl, bloomBlurSrc),
    }

    this._initFBOs()
  }

  _initFBOs() {
    const gl = this.gl
    const sim = CONFIG.SIM_RESOLUTION
    const dye = CONFIG.DYE_RESOLUTION
    const bloom = CONFIG.BLOOM_RESOLUTION

    // Prefer RG32F for velocity/pressure, fallback to RG16F
    const halfFloat = gl.HALF_FLOAT
    const float = gl.FLOAT

    this.velocity = createDoubleFBO(gl, sim, sim, gl.RG32F, gl.RG, float, gl.LINEAR)
    this.pressure = createDoubleFBO(gl, sim, sim, gl.R32F, gl.RED, float, gl.NEAREST)
    this.divergence = createFBO(gl, sim, sim, gl.R32F, gl.RED, float, gl.NEAREST)
    this.curl = createFBO(gl, sim, sim, gl.R32F, gl.RED, float, gl.NEAREST)
    this.dye = createDoubleFBO(gl, dye, dye, gl.RGBA16F, gl.RGBA, halfFloat, gl.LINEAR)

    // Bloom fbos: prefilter + 2 ping-pong blur passes
    this.bloomFBO = createFBO(gl, bloom, bloom, gl.RGBA16F, gl.RGBA, halfFloat, gl.LINEAR)
    this.bloomBlurA = createFBO(gl, bloom, bloom, gl.RGBA16F, gl.RGBA, halfFloat, gl.LINEAR)
    this.bloomBlurB = createFBO(gl, bloom, bloom, gl.RGBA16F, gl.RGBA, halfFloat, gl.LINEAR)
  }

  resize() {
    const gl = this.gl
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
  }

  _useProgram(name) {
    const { prog } = this.programs[name]
    this.gl.useProgram(prog)
    return this.programs[name].uniforms
  }

  _setTex(unit, tex) {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit)
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex)
  }

  _blit(fbo) {
    const gl = this.gl
    if (fbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo)
      gl.viewport(0, 0, fbo.width, fbo.height)
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  step(dt) {
    const gl = this.gl
    const sim = CONFIG.SIM_RESOLUTION
    gl.bindVertexArray(this.vao)
    gl.disable(gl.BLEND)

    const texW = 1 / sim
    const texH = 1 / sim

    // ── Curl ─────────────────────────────────────────────────
    {
      const u = this._useProgram('curl')
      this._setTex(0, this.velocity.read.tex)
      gl.uniform1i(u.u_velocity, 0)
      gl.uniform2f(u.u_texelSize, texW, texH)
      this._blit(this.curl)
    }

    // ── Vorticity confinement ─────────────────────────────────
    {
      const u = this._useProgram('vorticity')
      this._setTex(0, this.velocity.read.tex)
      this._setTex(1, this.curl.tex)
      gl.uniform1i(u.u_velocity, 0)
      gl.uniform1i(u.u_curl, 1)
      gl.uniform2f(u.u_texelSize, texW, texH)
      gl.uniform1f(u.u_curl_strength, CONFIG.CURL_STRENGTH)
      gl.uniform1f(u.u_dt, dt)
      this._blit(this.velocity.write)
      this.velocity.swap()
    }

    // ── Advect velocity ───────────────────────────────────────
    {
      const u = this._useProgram('advect')
      this._setTex(0, this.velocity.read.tex)
      this._setTex(1, this.velocity.read.tex)
      gl.uniform1i(u.u_velocity, 0)
      gl.uniform1i(u.u_source, 1)
      gl.uniform2f(u.u_texelSize, texW, texH)
      gl.uniform1f(u.u_dt, dt)
      gl.uniform1f(u.u_dissipation, CONFIG.VELOCITY_DISSIPATION)
      this._blit(this.velocity.write)
      this.velocity.swap()
    }

    // ── Divergence ────────────────────────────────────────────
    {
      const u = this._useProgram('divergence')
      this._setTex(0, this.velocity.read.tex)
      gl.uniform1i(u.u_velocity, 0)
      gl.uniform2f(u.u_texelSize, texW, texH)
      this._blit(this.divergence)
    }

    // ── Pressure solve (Jacobi) ───────────────────────────────
    // Clear pressure
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pressure.read.fbo)
    gl.viewport(0, 0, sim, sim)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    for (let i = 0; i < CONFIG.PRESSURE_ITERATIONS; i++) {
      const u = this._useProgram('pressure')
      this._setTex(0, this.pressure.read.tex)
      this._setTex(1, this.divergence.tex)
      gl.uniform1i(u.u_pressure, 0)
      gl.uniform1i(u.u_divergence, 1)
      gl.uniform2f(u.u_texelSize, texW, texH)
      this._blit(this.pressure.write)
      this.pressure.swap()
    }

    // ── Gradient subtraction ──────────────────────────────────
    {
      const u = this._useProgram('gradient')
      this._setTex(0, this.pressure.read.tex)
      this._setTex(1, this.velocity.read.tex)
      gl.uniform1i(u.u_pressure, 0)
      gl.uniform1i(u.u_velocity, 1)
      gl.uniform2f(u.u_texelSize, texW, texH)
      this._blit(this.velocity.write)
      this.velocity.swap()
    }

    // ── Advect dye ────────────────────────────────────────────
    {
      const dyeW = 1 / CONFIG.DYE_RESOLUTION
      const dyeH = 1 / CONFIG.DYE_RESOLUTION
      const u = this._useProgram('advect')
      this._setTex(0, this.velocity.read.tex)
      this._setTex(1, this.dye.read.tex)
      gl.uniform1i(u.u_velocity, 0)
      gl.uniform1i(u.u_source, 1)
      gl.uniform2f(u.u_texelSize, dyeW, dyeH)
      gl.uniform1f(u.u_dt, dt)
      gl.uniform1f(u.u_dissipation, CONFIG.DENSITY_DISSIPATION)
      this._blit(this.dye.write)
      this.dye.swap()
    }

    this._bloomPass()
  }

  _bloomPass() {
    const gl = this.gl

    // Prefilter (threshold)
    {
      const u = this._useProgram('bloomPrefilter')
      this._setTex(0, this.dye.read.tex)
      gl.uniform1i(u.u_dye, 0)
      gl.uniform1f(u.u_threshold, CONFIG.BLOOM_THRESHOLD)
      this._blit(this.bloomFBO)
    }

    const bw = 1 / CONFIG.BLOOM_RESOLUTION
    const bh = 1 / CONFIG.BLOOM_RESOLUTION

    // Horizontal blur
    {
      const u = this._useProgram('bloomBlur')
      this._setTex(0, this.bloomFBO.tex)
      gl.uniform1i(u.u_tex, 0)
      gl.uniform2f(u.u_direction, bw, 0)
      this._blit(this.bloomBlurA)
    }
    // Vertical blur
    {
      const u = this._useProgram('bloomBlur')
      this._setTex(0, this.bloomBlurA.tex)
      gl.uniform1i(u.u_tex, 0)
      gl.uniform2f(u.u_direction, 0, bh)
      this._blit(this.bloomBlurB)
    }
    // Second pass horizontal
    {
      const u = this._useProgram('bloomBlur')
      this._setTex(0, this.bloomBlurB.tex)
      gl.uniform1i(u.u_tex, 0)
      gl.uniform2f(u.u_direction, bw * 2, 0)
      this._blit(this.bloomBlurA)
    }
    // Second pass vertical
    {
      const u = this._useProgram('bloomBlur')
      this._setTex(0, this.bloomBlurA.tex)
      gl.uniform1i(u.u_tex, 0)
      gl.uniform2f(u.u_direction, 0, bh * 2)
      this._blit(this.bloomBlurB)
    }
  }

  render() {
    const gl = this.gl
    gl.bindVertexArray(this.vao)
    const u = this._useProgram('display')
    this._setTex(0, this.dye.read.tex)
    this._setTex(1, this.bloomBlurB.tex)
    gl.uniform1i(u.u_dye, 0)
    gl.uniform1i(u.u_bloom, 1)
    gl.uniform2f(u.u_texelSize, 1 / CONFIG.DYE_RESOLUTION, 1 / CONFIG.DYE_RESOLUTION)
    gl.uniform1f(u.u_bloomIntensity, CONFIG.BLOOM_INTENSITY)
    this._blit(null)
  }

  splat(x, y, dx, dy, color) {
    const gl = this.gl
    gl.bindVertexArray(this.vao)
    gl.disable(gl.BLEND)

    const aspect = this.canvas.width / this.canvas.height
    const aspectRatio = aspect > 1 ? [aspect, 1] : [1, 1 / aspect]

    // Velocity splat
    {
      const u = this._useProgram('splat')
      this._setTex(0, this.velocity.read.tex)
      gl.uniform1i(u.u_target, 0)
      gl.uniform2f(u.u_point, x, y)
      gl.uniform3f(u.u_color, dx, dy, 0)
      gl.uniform1f(u.u_radius, CONFIG.SPLAT_RADIUS * 0.08)
      gl.uniform1i(u.u_isVelocity, 1)
      gl.uniform2f(u.u_aspectRatio, aspectRatio[0], aspectRatio[1])
      this._blit(this.velocity.write)
      this.velocity.swap()
    }

    // Dye splat — multiply color by brightness factor so it looks vivid after tone-mapping
    const BRIGHTNESS = 5.0
    {
      const u = this._useProgram('splat')
      this._setTex(0, this.dye.read.tex)
      gl.uniform1i(u.u_target, 0)
      gl.uniform2f(u.u_point, x, y)
      gl.uniform3f(u.u_color, color[0] * BRIGHTNESS, color[1] * BRIGHTNESS, color[2] * BRIGHTNESS)
      gl.uniform1f(u.u_radius, CONFIG.SPLAT_RADIUS * 0.10)
      gl.uniform1i(u.u_isVelocity, 0)
      gl.uniform2f(u.u_aspectRatio, aspectRatio[0], aspectRatio[1])
      this._blit(this.dye.write)
      this.dye.swap()
    }
  }
}
