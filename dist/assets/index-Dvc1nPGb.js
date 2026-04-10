(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=`#version 300 es
precision highp float;

uniform sampler2D u_velocity;
uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform float u_dt;
uniform float u_dissipation;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  // Trace particle back in time
  // Velocity is in UV/s — multiply by dt to get UV displacement (no texelSize scaling)
  vec2 vel = texture(u_velocity, v_uv).xy;
  vec2 coord = v_uv - vel * u_dt;
  // GL_CLAMP_TO_EDGE handles borders; just keep in [0,1]
  coord = clamp(coord, vec2(0.0), vec2(1.0));
  fragColor = u_dissipation * texture(u_source, coord);
}
`,t=`#version 300 es
precision highp float;

uniform sampler2D u_velocity;
uniform vec2 u_texelSize;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  float L = texture(u_velocity, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float R = texture(u_velocity, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float B = texture(u_velocity, v_uv - vec2(0.0, u_texelSize.y)).y;
  float T = texture(u_velocity, v_uv + vec2(0.0, u_texelSize.y)).y;
  float div = 0.5 * ((R - L) + (T - B));
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}
`,n=`#version 300 es
precision highp float;

uniform sampler2D u_pressure;
uniform sampler2D u_divergence;
uniform vec2 u_texelSize;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  float L = texture(u_pressure, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float R = texture(u_pressure, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float B = texture(u_pressure, v_uv - vec2(0.0, u_texelSize.y)).x;
  float T = texture(u_pressure, v_uv + vec2(0.0, u_texelSize.y)).x;
  float div = texture(u_divergence, v_uv).x;
  // Jacobi iteration: p = (neighbors - div) / 4
  float p = (L + R + B + T - div) * 0.25;
  fragColor = vec4(p, 0.0, 0.0, 1.0);
}
`,r=`#version 300 es
precision highp float;

uniform sampler2D u_pressure;
uniform sampler2D u_velocity;
uniform vec2 u_texelSize;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  float L = texture(u_pressure, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float R = texture(u_pressure, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float B = texture(u_pressure, v_uv - vec2(0.0, u_texelSize.y)).x;
  float T = texture(u_pressure, v_uv + vec2(0.0, u_texelSize.y)).x;
  vec2 grad = 0.5 * vec2(R - L, T - B);
  vec2 vel = texture(u_velocity, v_uv).xy;
  fragColor = vec4(vel - grad, 0.0, 1.0);
}
`,i=`#version 300 es
precision highp float;

uniform sampler2D u_velocity;
uniform vec2 u_texelSize;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  float L = texture(u_velocity, v_uv - vec2(u_texelSize.x, 0.0)).y;
  float R = texture(u_velocity, v_uv + vec2(u_texelSize.x, 0.0)).y;
  float B = texture(u_velocity, v_uv - vec2(0.0, u_texelSize.y)).x;
  float T = texture(u_velocity, v_uv + vec2(0.0, u_texelSize.y)).x;
  // curl = dVy/dx - dVx/dy
  float curl = 0.5 * ((R - L) - (T - B));
  fragColor = vec4(curl, 0.0, 0.0, 1.0);
}
`,a=`#version 300 es
precision highp float;

uniform sampler2D u_velocity;
uniform sampler2D u_curl;
uniform vec2 u_texelSize;
uniform float u_curl_strength;
uniform float u_dt;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  float L = texture(u_curl, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float R = texture(u_curl, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float B = texture(u_curl, v_uv - vec2(0.0, u_texelSize.y)).x;
  float T = texture(u_curl, v_uv + vec2(0.0, u_texelSize.y)).x;
  float C = texture(u_curl, v_uv).x;

  // Gradient of |curl|, then perpendicular force
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  float len = max(length(force), 1e-5);
  force = force / len;
  force *= u_curl_strength * C * vec2(1.0, -1.0);

  vec2 vel = texture(u_velocity, v_uv).xy;
  fragColor = vec4(vel + force * u_dt, 0.0, 1.0);
}
`,o=`#version 300 es
precision highp float;

uniform sampler2D u_target;
uniform vec2 u_point;      // normalized 0..1
uniform vec3 u_color;
uniform float u_radius;
uniform bool u_isVelocity;
uniform vec2 u_aspectRatio; // (1.0, height/width) or (width/height, 1.0)

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 diff = (v_uv - u_point) * u_aspectRatio;
  float dist2 = dot(diff, diff);
  float splat = exp(-dist2 / (u_radius * u_radius));

  vec4 base = texture(u_target, v_uv);

  if (u_isVelocity) {
    // u_color.xy = force direction, z unused
    fragColor = base + vec4(u_color.xy * splat, 0.0, 1.0);
  } else {
    fragColor = base + vec4(u_color * splat, splat);
  }
}
`,s=`#version 300 es
precision highp float;

uniform sampler2D u_dye;
uniform sampler2D u_bloom;
uniform vec2 u_texelSize;
uniform float u_bloomIntensity;

in vec2 v_uv;
out vec4 fragColor;

// Tone map to keep colors vivid
vec3 toneMap(vec3 c) {
  return c / (c + 0.5);
}

void main() {
  vec3 dye = texture(u_dye, v_uv).rgb;
  vec3 bloom = texture(u_bloom, v_uv).rgb;

  vec3 color = dye + bloom * u_bloomIntensity;

  // Gamma correction + tone mapping for vivid look
  color = toneMap(color);
  color = pow(max(color, 0.0), vec3(0.45));

  fragColor = vec4(color, 1.0);
}
`,c=`#version 300 es
precision highp float;

uniform sampler2D u_dye;
uniform float u_threshold;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec3 c = texture(u_dye, v_uv).rgb;
  float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Soft knee
  float rq = clamp(brightness - u_threshold + 0.5, 0.0, 1.0);
  rq = rq * rq * 0.5;
  c *= max(rq, brightness - u_threshold) / max(brightness, 1e-4);
  fragColor = vec4(c, 1.0);
}
`,l=`#version 300 es
precision highp float;

uniform sampler2D u_tex;
uniform vec2 u_direction; // (texelW, 0) or (0, texelH)

in vec2 v_uv;
out vec4 fragColor;

// 9-tap Gaussian
void main() {
  vec4 sum = vec4(0.0);
  sum += texture(u_tex, v_uv - u_direction * 4.0) * 0.051;
  sum += texture(u_tex, v_uv - u_direction * 3.0) * 0.0918;
  sum += texture(u_tex, v_uv - u_direction * 2.0) * 0.12245;
  sum += texture(u_tex, v_uv - u_direction * 1.0) * 0.1531;
  sum += texture(u_tex, v_uv)                      * 0.1633;
  sum += texture(u_tex, v_uv + u_direction * 1.0) * 0.1531;
  sum += texture(u_tex, v_uv + u_direction * 2.0) * 0.12245;
  sum += texture(u_tex, v_uv + u_direction * 3.0) * 0.0918;
  sum += texture(u_tex, v_uv + u_direction * 4.0) * 0.051;
  fragColor = sum;
}
`,u=`#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`,d={SIM_RESOLUTION:128,DYE_RESOLUTION:512,PRESSURE_ITERATIONS:25,VELOCITY_DISSIPATION:.98,DENSITY_DISSIPATION:.975,CURL_STRENGTH:28,SPLAT_RADIUS:.18,BLOOM_THRESHOLD:.4,BLOOM_INTENSITY:.8,BLOOM_RESOLUTION:256};function f(e,t,n){let r=e.createShader(t);if(e.shaderSource(r,n),e.compileShader(r),!e.getShaderParameter(r,e.COMPILE_STATUS))throw Error(`Shader compile error: `+e.getShaderInfoLog(r)+`

Source:
`+n);return r}function p(e,t){let n=f(e,e.VERTEX_SHADER,u),r=f(e,e.FRAGMENT_SHADER,t),i=e.createProgram();if(e.attachShader(i,n),e.attachShader(i,r),e.linkProgram(i),!e.getProgramParameter(i,e.LINK_STATUS))throw Error(`Program link error: `+e.getProgramInfoLog(i));let a={},o=e.getProgramParameter(i,e.ACTIVE_UNIFORMS);for(let t=0;t<o;t++){let n=e.getActiveUniform(i,t);a[n.name]=e.getUniformLocation(i,n.name)}return{prog:i,uniforms:a}}function m(e,t,n,r,i,a,o){e.activeTexture(e.TEXTURE0);let s=e.createTexture();e.bindTexture(e.TEXTURE_2D,s),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,o),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,o),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texImage2D(e.TEXTURE_2D,0,r,t,n,0,i,a,null);let c=e.createFramebuffer();return e.bindFramebuffer(e.FRAMEBUFFER,c),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.viewport(0,0,t,n),e.clear(e.COLOR_BUFFER_BIT),{tex:s,fbo:c,width:t,height:n}}function h(e,t,n,r,i,a,o){let s=m(e,t,n,r,i,a,o),c=m(e,t,n,r,i,a,o);return{width:t,height:n,get read(){return s},get write(){return c},swap(){[s,c]=[c,s]}}}var g=class{constructor(e){if(this.canvas=e,this.gl=e.getContext(`webgl2`,{alpha:!1,antialias:!1,preserveDrawingBuffer:!1}),!this.gl)throw Error(`WebGL2 not supported`);this._init()}_init(){let u=this.gl;u.getExtension(`EXT_color_buffer_float`),u.getExtension(`OES_texture_float_linear`);let d=u.createBuffer();u.bindBuffer(u.ARRAY_BUFFER,d),u.bufferData(u.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),u.STATIC_DRAW);let f=u.createVertexArray();u.bindVertexArray(f),u.enableVertexAttribArray(0),u.vertexAttribPointer(0,2,u.FLOAT,!1,0,0),this.vao=f,this.programs={advect:p(u,e),divergence:p(u,t),pressure:p(u,n),gradient:p(u,r),curl:p(u,i),vorticity:p(u,a),splat:p(u,o),display:p(u,s),bloomPrefilter:p(u,c),bloomBlur:p(u,l)},this._initFBOs()}_initFBOs(){let e=this.gl,t=d.SIM_RESOLUTION,n=d.DYE_RESOLUTION,r=d.BLOOM_RESOLUTION,i=e.HALF_FLOAT,a=e.FLOAT;this.velocity=h(e,t,t,e.RG32F,e.RG,a,e.LINEAR),this.pressure=h(e,t,t,e.R32F,e.RED,a,e.NEAREST),this.divergence=m(e,t,t,e.R32F,e.RED,a,e.NEAREST),this.curl=m(e,t,t,e.R32F,e.RED,a,e.NEAREST),this.dye=h(e,n,n,e.RGBA16F,e.RGBA,i,e.LINEAR),this.bloomFBO=m(e,r,r,e.RGBA16F,e.RGBA,i,e.LINEAR),this.bloomBlurA=m(e,r,r,e.RGBA16F,e.RGBA,i,e.LINEAR),this.bloomBlurB=m(e,r,r,e.RGBA16F,e.RGBA,i,e.LINEAR)}resize(){this.gl;let e=this.canvas.clientWidth,t=this.canvas.clientHeight;(this.canvas.width!==e||this.canvas.height!==t)&&(this.canvas.width=e,this.canvas.height=t)}_useProgram(e){let{prog:t}=this.programs[e];return this.gl.useProgram(t),this.programs[e].uniforms}_setTex(e,t){this.gl.activeTexture(this.gl.TEXTURE0+e),this.gl.bindTexture(this.gl.TEXTURE_2D,t)}_blit(e){let t=this.gl;e?(t.bindFramebuffer(t.FRAMEBUFFER,e.fbo),t.viewport(0,0,e.width,e.height)):(t.bindFramebuffer(t.FRAMEBUFFER,null),t.viewport(0,0,t.drawingBufferWidth,t.drawingBufferHeight)),t.drawArrays(t.TRIANGLE_STRIP,0,4)}step(e){let t=this.gl,n=d.SIM_RESOLUTION;t.bindVertexArray(this.vao),t.disable(t.BLEND);let r=1/n,i=1/n;{let e=this._useProgram(`curl`);this._setTex(0,this.velocity.read.tex),t.uniform1i(e.u_velocity,0),t.uniform2f(e.u_texelSize,r,i),this._blit(this.curl)}{let n=this._useProgram(`vorticity`);this._setTex(0,this.velocity.read.tex),this._setTex(1,this.curl.tex),t.uniform1i(n.u_velocity,0),t.uniform1i(n.u_curl,1),t.uniform2f(n.u_texelSize,r,i),t.uniform1f(n.u_curl_strength,d.CURL_STRENGTH),t.uniform1f(n.u_dt,e),this._blit(this.velocity.write),this.velocity.swap()}{let n=this._useProgram(`advect`);this._setTex(0,this.velocity.read.tex),this._setTex(1,this.velocity.read.tex),t.uniform1i(n.u_velocity,0),t.uniform1i(n.u_source,1),t.uniform2f(n.u_texelSize,r,i),t.uniform1f(n.u_dt,e),t.uniform1f(n.u_dissipation,d.VELOCITY_DISSIPATION),this._blit(this.velocity.write),this.velocity.swap()}{let e=this._useProgram(`divergence`);this._setTex(0,this.velocity.read.tex),t.uniform1i(e.u_velocity,0),t.uniform2f(e.u_texelSize,r,i),this._blit(this.divergence)}t.bindFramebuffer(t.FRAMEBUFFER,this.pressure.read.fbo),t.viewport(0,0,n,n),t.clearColor(0,0,0,0),t.clear(t.COLOR_BUFFER_BIT);for(let e=0;e<d.PRESSURE_ITERATIONS;e++){let e=this._useProgram(`pressure`);this._setTex(0,this.pressure.read.tex),this._setTex(1,this.divergence.tex),t.uniform1i(e.u_pressure,0),t.uniform1i(e.u_divergence,1),t.uniform2f(e.u_texelSize,r,i),this._blit(this.pressure.write),this.pressure.swap()}{let e=this._useProgram(`gradient`);this._setTex(0,this.pressure.read.tex),this._setTex(1,this.velocity.read.tex),t.uniform1i(e.u_pressure,0),t.uniform1i(e.u_velocity,1),t.uniform2f(e.u_texelSize,r,i),this._blit(this.velocity.write),this.velocity.swap()}{let n=1/d.DYE_RESOLUTION,r=1/d.DYE_RESOLUTION,i=this._useProgram(`advect`);this._setTex(0,this.velocity.read.tex),this._setTex(1,this.dye.read.tex),t.uniform1i(i.u_velocity,0),t.uniform1i(i.u_source,1),t.uniform2f(i.u_texelSize,n,r),t.uniform1f(i.u_dt,e),t.uniform1f(i.u_dissipation,d.DENSITY_DISSIPATION),this._blit(this.dye.write),this.dye.swap()}this._bloomPass()}_bloomPass(){let e=this.gl;{let t=this._useProgram(`bloomPrefilter`);this._setTex(0,this.dye.read.tex),e.uniform1i(t.u_dye,0),e.uniform1f(t.u_threshold,d.BLOOM_THRESHOLD),this._blit(this.bloomFBO)}let t=1/d.BLOOM_RESOLUTION,n=1/d.BLOOM_RESOLUTION;{let n=this._useProgram(`bloomBlur`);this._setTex(0,this.bloomFBO.tex),e.uniform1i(n.u_tex,0),e.uniform2f(n.u_direction,t,0),this._blit(this.bloomBlurA)}{let t=this._useProgram(`bloomBlur`);this._setTex(0,this.bloomBlurA.tex),e.uniform1i(t.u_tex,0),e.uniform2f(t.u_direction,0,n),this._blit(this.bloomBlurB)}{let n=this._useProgram(`bloomBlur`);this._setTex(0,this.bloomBlurB.tex),e.uniform1i(n.u_tex,0),e.uniform2f(n.u_direction,t*2,0),this._blit(this.bloomBlurA)}{let t=this._useProgram(`bloomBlur`);this._setTex(0,this.bloomBlurA.tex),e.uniform1i(t.u_tex,0),e.uniform2f(t.u_direction,0,n*2),this._blit(this.bloomBlurB)}}render(){let e=this.gl;e.bindVertexArray(this.vao);let t=this._useProgram(`display`);this._setTex(0,this.dye.read.tex),this._setTex(1,this.bloomBlurB.tex),e.uniform1i(t.u_dye,0),e.uniform1i(t.u_bloom,1),e.uniform2f(t.u_texelSize,1/d.DYE_RESOLUTION,1/d.DYE_RESOLUTION),e.uniform1f(t.u_bloomIntensity,d.BLOOM_INTENSITY),this._blit(null)}splat(e,t,n,r,i){let a=this.gl;a.bindVertexArray(this.vao),a.disable(a.BLEND);let o=this.canvas.width/this.canvas.height,s=o>1?[o,1]:[1,1/o];{let i=this._useProgram(`splat`);this._setTex(0,this.velocity.read.tex),a.uniform1i(i.u_target,0),a.uniform2f(i.u_point,e,t),a.uniform3f(i.u_color,n,r,0),a.uniform1f(i.u_radius,d.SPLAT_RADIUS*.08),a.uniform1i(i.u_isVelocity,1),a.uniform2f(i.u_aspectRatio,s[0],s[1]),this._blit(this.velocity.write),this.velocity.swap()}{let n=this._useProgram(`splat`);this._setTex(0,this.dye.read.tex),a.uniform1i(n.u_target,0),a.uniform2f(n.u_point,e,t),a.uniform3f(n.u_color,i[0]*5,i[1]*5,i[2]*5),a.uniform1f(n.u_radius,d.SPLAT_RADIUS*.1),a.uniform1i(n.u_isVelocity,0),a.uniform2f(n.u_aspectRatio,s[0],s[1]),this._blit(this.dye.write),this.dye.swap()}}},_=class{constructor({onResults:e}){this._onResults=e,this._prev={},this._hues=[0,200],this._hueSpeed=40,this._lastTime=performance.now(),this._ready=!1,this._video=null,this._camera=null}async init(e){if(e)this._video=e;else{let e=document.createElement(`video`);e.style.cssText=`position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;`,e.setAttribute(`playsinline`,``),e.setAttribute(`muted`,``),document.body.appendChild(e),this._video=e}await this._waitForMediaPipe();let t=new window.Hands({locateFile:e=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${e}`});t.setOptions({maxNumHands:2,modelComplexity:1,minDetectionConfidence:.7,minTrackingConfidence:.5}),t.onResults(e=>this._handleResults(e)),this._hands=t;let n=new window.Camera(video,{onFrame:async()=>{await t.send({image:video})},width:320,height:240});this._camera=n,await n.start(),this._ready=!0}_waitForMediaPipe(){return new Promise(e=>{let t=()=>{window.Hands&&window.Camera?e():setTimeout(t,50)};t()})}_handleResults(e){let t=performance.now(),n=Math.min((t-this._lastTime)/1e3,.1);this._lastTime=t;for(let e=0;e<2;e++)this._hues[e]=(this._hues[e]+this._hueSpeed*n)%360;let r=[];if(!e.multiHandLandmarks){this._prev={},this._onResults(r);return}e.multiHandLandmarks.forEach((e,t)=>{[e[8],e[12]].forEach((e,i)=>{let a=`${t}_${i}`,o=1-e.x,s=1-e.y,c=this._prev[a],l=0,u=0;c&&(l=(o-c.x)/n,u=(s-c.y)/n),this._prev[a]={x:o,y:s};let d=Math.sqrt(l*l+u*u),f=v((this._hues[t]+i*30)%360,1,.65),p=Math.max(d*.08,.004);r.push({x:o,y:s,dx:l*.15,dy:u*.15,color:f,force:p})})});let i=new Set;e.multiHandLandmarks&&e.multiHandLandmarks.forEach((e,t)=>{i.add(`${t}_0`),i.add(`${t}_1`)});for(let e of Object.keys(this._prev))i.has(e)||delete this._prev[e];this._onResults(r)}isReady(){return this._ready}};function v(e,t,n){e/=360;let r,i,a;if(t===0)r=i=a=n;else{let o=(e,t,n)=>(n<0&&(n+=1),n>1&&--n,n<1/6?e+(t-e)*6*n:n<1/2?t:n<2/3?e+(t-e)*(2/3-n)*6:e),s=n<.5?n*(1+t):n+t-n*t,c=2*n-s;r=o(c,s,e+1/3),i=o(c,s,e),a=o(c,s,e-1/3)}return[r,i,a]}var y=document.getElementById(`c`),b=document.getElementById(`status`),x=document.getElementById(`camera-feed`),S=document.getElementById(`toggle-btn`),C=!1;S.addEventListener(`click`,()=>{C=!C,x.style.display=C?`block`:`none`,y.classList.toggle(`camera-on`,C),S.textContent=C?`⬛ Hide Camera`:`📷 Show Camera`,S.classList.toggle(`active`,C)});function w(){let e=Math.min(window.devicePixelRatio||1,1.5);y.width=Math.round(y.clientWidth*e),y.height=Math.round(y.clientHeight*e)}w(),window.addEventListener(`resize`,w);var T=new g(y),E=[],D=new _({onResults(e){E=e}}),O=null,k=null;y.addEventListener(`mousemove`,e=>{let t=y.getBoundingClientRect(),n=(e.clientX-t.left)/t.width,r=1-(e.clientY-t.top)/t.height;k=O,O={x:n,y:r}}),y.addEventListener(`mouseleave`,()=>{O=null,k=null});var A=0,j=performance.now();function M(e){requestAnimationFrame(M);let t=Math.min((e-j)/1e3,.033);j=e,A=(A+40*t)%360;for(let e of E)T.splat(e.x,e.y,e.dx,e.dy,e.color);if(E=[],O&&k){let e=(O.x-k.x)/t,n=(O.y-k.y)/t,r=N(A,1,.6);T.splat(O.x,O.y,e*.15,n*.15,r)}k=O?{...O}:null,T.step(t),T.render()}requestAnimationFrame(M),b.textContent=`requesting camera…`,D.init(x).then(()=>{b.textContent=`hands: tracking`,setTimeout(()=>{b.style.opacity=`0`},3e3)}).catch(e=>{console.warn(`Hand tracking unavailable:`,e),b.textContent=`hand tracking unavailable — use mouse`,setTimeout(()=>{b.style.opacity=`0`},4e3)});function N(e,t,n){e/=360;let r,i,a;if(t===0)r=i=a=n;else{let o=(e,t,n)=>(n<0&&(n+=1),n>1&&--n,n<1/6?e+(t-e)*6*n:n<1/2?t:n<2/3?e+(t-e)*(2/3-n)*6:e),s=n<.5?n*(1+t):n+t-n*t,c=2*n-s;r=o(c,s,e+1/3),i=o(c,s,e),a=o(c,s,e-1/3)}return[r,i,a]}