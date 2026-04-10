#version 300 es
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
