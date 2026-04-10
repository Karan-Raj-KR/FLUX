#version 300 es
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
