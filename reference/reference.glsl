// reference.frag — GLSL data API reference
#version 300 es
precision highp float;
precision highp int;
// lowp  — 8-bit,  fine for color
// mediump — 16-bit, fine for most math
// highp — 32-bit, required for data textures and position math

// samplers — set via gl.uniform1i to the texture slot number
uniform sampler2D u_data;      // 2D texture
uniform sampler2D u_prev;      // another 2D texture on a different slot
uniform int       u_count;
uniform float     u_time;
uniform vec3      u_position;

out vec4 fragColor;

struct Example {
	vec3  position;
	float value;
	int   index;
};

// texelFetch — integer pixel coordinates, no filtering, no mipmaps
// texelFetch(sampler, ivec2(x, y), mipLevel)
// this is what you use for data textures
Example fetchExample(int i) {
	vec4 texel0 = texelFetch(u_data, ivec2(0, i), 0);
	vec4 texel1 = texelFetch(u_data, ivec2(1, i), 0);

	Example example;
	example.position = texel0.xyz;
	example.value    = texel0.w;
	example.index    = int(texel1.x);
	return example;
}

// texture — normalized uv coordinates [0,1], applies filtering
// this is what you use for visual/color textures
vec4 sampleColor(vec2 uv) {
	return texture(u_prev, uv);
}

void main() {
	// gl_FragCoord — pixel coordinate of this fragment, origin bottom-left
	// .xy are the pixel position, .z is depth [0,1], .w is 1/w
	vec2 uv = gl_FragCoord.xy / vec2(800.0, 600.0);

	// swizzling — reorder or repeat any components
	vec4 texel = texelFetch(u_data, ivec2(0, 0), 0);
	vec3 xyz  = texel.xyz;   // same as texel.rgb
	vec3 zyx  = texel.zyx;
	vec2 xy   = texel.xy;
	float x   = texel.x;    // same as texel.r
	vec4 xxxx = texel.xxxx;

	// constructors — can mix scalars and vectors freely
	vec3 a = vec3(1.0, 2.0, 3.0);
	vec3 b = vec3(xy, 1.0);
	vec4 c = vec4(a, 1.0);
	vec4 d = vec4(x, x, x, 1.0);
	vec3 e = vec3(texel.zw, 1.0);

	// int/float casting
	int  asInt   = int(texel.x);
	float asFloat = float(asInt);

	fragColor = vec4(uv, 0.0, 1.0);
}