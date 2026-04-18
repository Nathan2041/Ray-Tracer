// Declare GLSL version — required for WebGL2
#version 300 es

// Per-vertex input from your buffer (location = 0)
in vec2 a_position;

// Passed to fragment shader
out vec2 v_uv;

void main() {
  v_uv       = a_position * 0.5 + 0.5;   // map [-1,1] → [0,1]
  gl_Position = vec4(a_position, 0.0, 1.0);
}