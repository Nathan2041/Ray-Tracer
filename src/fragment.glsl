#version 300 es
precision highp float;

struct Triangle {
	vec3 vertex0;
	vec3 vertex1;
	vec3 vertex2;
	vec3 color;
	float luminosity;
	float index;
};

struct BVH {
	vec3 min;
	vec3 max;
	int[2] children;
	int triangleStart;
	int triangleCount;
}

in  vec2 v_uv;
out vec4 fragColor;

uniform float     u_time;
uniform int       u_frame;
uniform sampler2D u_prev;

// Triangle fetchTriangle(int i) {
// 	vec4[4] texels = [
// 		texelFetch(u_triangles, ivec2(0, i), 0),
// 		texelFetch(u_triangles, ivec2(1, i), 0),
// 		texelFetch(u_triangles, ivec2(3, i), 0),
// 		texelFetch(u_triangles, ivec2(2, i), 0)
// 	];
// 
// 	Triangle triangle;
// 	triangle.vertex0    = texels[0].xyz;
// 	triangle.vertex1    = vec3(texels[0].w, texels[1].xy);
// 	triangle.vertex2    = vec3(texels[1].zw, texels[2].x);
// 	triangle.color      = texels[2].yzw;
// 	triangle.luminosity = texels[3].x;
// 	triangle.index      = texels[3].y;
// 	return triangle;
// }

void main() {
	vec3 col  = 0.5 + 0.5 * cos(u_time + v_uv.xyx + vec3(0, 2, 4));
	vec3 prev = texture(u_prev, v_uv).rgb;
	fragColor = vec4(mix(prev, col, 1.0 / float(u_frame + 1)), 1.0);
}