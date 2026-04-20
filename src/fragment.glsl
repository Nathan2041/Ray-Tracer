#version 300 es
precision highp float;

in  vec2 v_uv;
out vec4 fragColor;

uniform float     u_time;
uniform int       u_frame;
uniform sampler2D u_prev;

void main() {
	vec3 col  = 0.5 + 0.5 * cos(u_time + v_uv.xyx + vec3(0, 2, 4));
	vec3 prev = texture(u_prev, v_uv).rgb;
	// fragColor = vec4(mix(prev, col, 1.0 / float(u_frame + 1)), 1.0);
	fragColor = vec4(float(int(v_uv.x * 10.)) / 10., float(int(v_uv.y * 10.)) / 10., 1., 1.);
}

struct Triangle {
	vec3 vertex0;
	vec3 vertex1;
	vec3 vertex2;
	vec3 color;
	float luminosity;
	float index;
};

struct BoundingBox {
	vec3 min;
	vec3 max;
	bvec2 childrenType; // isBoundingBox
	ivec2 children;
};




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

// struct Node {
// 	int[2]: children;
// 	
// }