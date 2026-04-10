#version 300 es
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
