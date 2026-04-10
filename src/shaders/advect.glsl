#version 300 es
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
