#version 300 es
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
