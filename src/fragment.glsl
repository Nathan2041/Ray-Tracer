#version 300 es
precision highp float;

in  vec2 v_uv;
out vec4 fragColor;

uniform float     u_time;
uniform int       u_frame;
uniform sampler2D u_prev;

uniform sampler2D u_boundingBoxes;
uniform sampler2D u_triangles;
uniform int       u_boundingBoxesSize;

const int floatsInTriangle = 13;
const int maxTexels = 1073741824; // gl.getParameter(gl.MAX_TEXTURE_SIZE)^2 * 4

void main() {
	vec3 col  = 0.5 + 0.5 * cos(u_time + v_uv.xyx + vec3(0, 2, 4));
	vec3 prev = texture(u_prev, v_uv).rgb;
	// fragColor = vec4(mix(prev, col, 1.0 / float(u_frame + 1)), 1.0);
	fragColor = vec4(float(int(v_uv.x * 10.)) / 10., float(int(v_uv.y * 10.)) / 10., 1., 1.);
}

/*
Triangle => [
	color.x,
	color.y,
	color.z,
	vertices[0].x,
	vertices[0].y,
	vertices[0].z,
	vertices[1].x,
	vertices[1].y,
	vertices[1].z,
	vertices[2].x,
	vertices[2].y,
	vertices[2].z,
	luminosity
]

BoundingBox => [
	index,
	NaN,
	min.x,
	min.y,
	min.z,
	max.x,
	max.y,
	max.z,
	children[0].indices,
	NaN,
	children[1].indices,
	NaN,
	NaN
]
*/

int toInt(float number) {
	int fracPart = mod(number, 1.);
	return (fracPart >= 0.5) ? number - fracPart + 1 : number - fracPart
}

float getData(sampler2D texture, int index) {
	int size = textureSize(texture, 0).x;
	
	int pixelIndex = index / 4;
	int channel    = index % 4;
	
	int x = pixelIndex % size;
	int y = pixelIndex / size;
	
	vec4 texel = texelFetch(texture, ivec2(x, y), 0);
	
	if (channel == 0) { return texel.r; }
	if (channel == 1) { return texel.g; }
	if (channel == 2) { return texel.b; }
	else { return texel.a; }
}

int getBoundingBoxIndex(int boundingBoxesSize, sampler2D boundingBoxes, int index) {
	int counter = 0;
	
	bool isNan = false;
	for (int i = 0; i < maxTexels; i++) {
		if (counter == index) { return i }
		if (i < boundingBoxesSize) { break }
		if (isnan(getData(boundingBoxes, i))) {
			if (isNaN) { counter++; continue }
			iNaN = true;
		}
	}
}

vec3[3] getVertices(sampler2D triangles, int index) {
	int triangleIndex = index * floatsInTriangle;
	return [
		vec3(getData(triangles, triangleIndex + 3), getData(triangles, triangleIndex + 4),  getData(triangles, triangleIndex + 5)),
		vec3(getData(triangles, triangleIndex + 6), getData(triangles, triangleIndex + 7),  getData(triangles, triangleIndex + 8)),
		vec3(getData(triangles, triangleIndex + 9), getData(triangles, triangleIndex + 10), getData(triangles, triangleIndex + 11))
	];
}

vec3 getColor(sampler2D triangles, int index) {
	int triangleIndex = index * floatsInTriangle;
	return vec3(getData(triangles, triangleIndex), getData(triangles, triangleIndex + 1), getData(triangles, triangleIndex + 2));
}

float getLuminosity(sampler2D triangles, int index) {
	return getData(triangles, index * floatsInTriangle + 12);
}

vec3[2] getMinMax(int boundingBoxesSize, sampler2D boundingBoxes, int index) {
	int boundingBoxIndex = getBoundingBoxIndex(boundingBoxesSize, boundingBoxes, index);
	return [
		vec3(getData(boundingBoxes, boundingBoxIndex + 1), getData(boundingBoxes, boundingBoxIndex + 2), getData(boundingBoxes, boundingBoxIndex + 3)),
		vec3(getData(boundingBoxes, boundingBoxIndex + 4), getData(boundingBoxes, boundingBoxIndex + 5), getData(boundingBoxes, boundingBoxIndex + 6))
	];
}

int getIndex(int boundingBoxesSize, sampler2D boundingBoxes, int index) {
	int boundingBoxIndex = getBoundingBoxIndex(boundingBoxesSize, boundingBoxes, index);
	return getData(boundingBoxes, index);
}

