#version 300 es
precision highp float;

in  vec2 v_uv;
out vec4 fragColor;

uniform float     u_time;
uniform int       u_frame;
uniform sampler2D u_prev;

uniform sampler2D u_boundingBoxes;
uniform sampler2D u_triangles;
uniform sampler2D u_ray;
uniform int       u_triangleCount;

const int floatsInTriangle    = 13;
const int floatsInBoundingBox = 13;

struct HitInfo {
	float distance;
	vec2  uv;
	int   index;
};

float getData(in sampler2D tex, in int index) {
	int size = textureSize(tex, 0).x;

	int pixelIndex = index / 4;
	int channel    = index % 4;

	int x = pixelIndex % size;
	int y = pixelIndex / size;

	vec4 texel = texelFetch(tex, ivec2(x, y), 0);

	if (channel == 0) return texel.r;
	if (channel == 1) return texel.g;
	if (channel == 2) return texel.b;
	return texel.a;
}

float rand(inout uint seed) {
	seed ^= seed << 13u;
	seed ^= seed >> 17u;
	seed ^= seed << 5u;
	return float(seed) / 4294967295.0;
}

vec3 alignedHemisphereSample(in vec3 normal, inout uint seed) {
	float phi      = 6.28318530 * rand(seed);
	float cosTheta = rand(seed);
	float sinTheta = sqrt(1.0 - cosTheta * cosTheta);

	vec3 up        = abs(normal.y) < 0.999 ? vec3(0, 1, 0) : vec3(0, 0, 1);
	vec3 tangent   = normalize(cross(up, normal));
	vec3 bitangent = cross(normal, tangent);

	return normalize(sinTheta * cos(phi) * tangent + sinTheta * sin(phi) * bitangent + cosTheta * normal);
}

int toInt(in float number) {
	return int(number + 0.5);
}

void getVertices(out vec3 vertex0, out vec3 vertex1, out vec3 vertex2, in sampler2D triangles, in int index) {
	int base = index * floatsInTriangle;
	vertex0 = vec3(getData(triangles, base + 3), getData(triangles, base + 4),  getData(triangles, base + 5));
	vertex1 = vec3(getData(triangles, base + 6), getData(triangles, base + 7),  getData(triangles, base + 8));
	vertex2 = vec3(getData(triangles, base + 9), getData(triangles, base + 10), getData(triangles, base + 11));
}

vec3 getColor(in sampler2D triangles, in int index) {
	int base = index * floatsInTriangle;
	return vec3(getData(triangles, base), getData(triangles, base + 1), getData(triangles, base + 2));
}

float getLuminosity(in sampler2D triangles, in int index) {
	return getData(triangles, index * floatsInTriangle + 12);
}

void getMinMax(out vec3 bbMin, out vec3 bbMax, in sampler2D boundingBoxes, in int index) {
	int base = index * floatsInBoundingBox;
	bbMin = vec3(getData(boundingBoxes, base + 1), getData(boundingBoxes, base + 2), getData(boundingBoxes, base + 3));
	bbMax = vec3(getData(boundingBoxes, base + 4), getData(boundingBoxes, base + 5), getData(boundingBoxes, base + 6));
}

int getChildType(in sampler2D boundingBoxes, in int nodeIndex, in int child) {
	return toInt(getData(boundingBoxes, nodeIndex * floatsInBoundingBox + 7 + child * 3));
}

int getChildStart(in sampler2D boundingBoxes, in int nodeIndex, in int child) {
	return toInt(getData(boundingBoxes, nodeIndex * floatsInBoundingBox + 8 + child * 3));
}

int getChildCount(in sampler2D boundingBoxes, in int nodeIndex, in int child) {
	return toInt(getData(boundingBoxes, nodeIndex * floatsInBoundingBox + 9 + child * 3));
}

int getPoolTriangleIndex(in sampler2D triangles, in int poolStart, in int n) {
	return toInt(getData(triangles, u_triangleCount * floatsInTriangle + poolStart + n));
}

float rayAABBIntersection(in vec3 origin, in vec3 direction, in vec3 bbMin, in vec3 bbMax) {
	vec3  invDir = 1.0 / direction;
	vec3  t0     = (bbMin - origin) * invDir;
	vec3  t1     = (bbMax - origin) * invDir;
	vec3  tMin   = min(t0, t1);
	vec3  tMax   = max(t0, t1);
	float tEnter = max(max(tMin.x, tMin.y), tMin.z);
	float tExit  = min(min(tMax.x, tMax.y), tMax.z);
	return (tExit >= max(tEnter, 0.0)) ? tEnter : 1e30;
}

HitInfo rayTriangleIntersection(in vec3 origin, in vec3 direction, in vec3 v0, in vec3 v1, in vec3 v2, in int triIdx) {
	HitInfo result;
	result.index    = -1;
	result.distance = 1e30;
	result.uv       = vec2(0.0);

	vec3 edge1          = v1 - v0;
	vec3 edge2          = v2 - v0;
	vec3 triangleNormal = cross(edge1, edge2);

	float normalDotRay = dot(triangleNormal, direction);
	if (abs(normalDotRay) < 1e-8) return result;

	float distanceToPlane = dot(triangleNormal, v0 - origin) / normalDotRay;
	if (distanceToPlane < 1e-8) return result;

	vec3  vertexToIntersection = origin + direction * distanceToPlane - v0;
	float normalSqMag          = dot(triangleNormal, triangleNormal);

	float u = dot(triangleNormal, cross(vertexToIntersection, edge2)) / normalSqMag;
	if (u < 0.0 || u > 1.0) return result;

	float v = dot(triangleNormal, cross(edge1, vertexToIntersection)) / normalSqMag;
	if (v < 0.0 || u + v > 1.0) return result;

	result.distance = distanceToPlane;
	result.uv       = vec2(u, v);
	result.index    = triIdx;
	return result;
}

HitInfo rayBVHIntersection(in sampler2D boundingBoxes, in sampler2D triangles, in vec3 origin, in vec3 direction) {
	HitInfo closest;
	closest.index    = -1;
	closest.distance = 1e30;
	closest.uv       = vec2(0.0);

	int stack[64];
	int stackSize      = 0;
	stack[stackSize++] = 0;

	while (stackSize > 0) {
		int bbIdx = stack[--stackSize];

		vec3  bbMin, bbMax;
		getMinMax(bbMin, bbMax, boundingBoxes, bbIdx);
		float tEnter = rayAABBIntersection(origin, direction, bbMin, bbMax);
		if (tEnter >= closest.distance) continue;

		for (int child = 0; child < 2; child++) {
			int cType  = getChildType(boundingBoxes, bbIdx, child);
			int cStart = getChildStart(boundingBoxes, bbIdx, child);
			int cCount = getChildCount(boundingBoxes, bbIdx, child);
			if (cCount == 0) continue;

			if (cType == 1) {
				stack[stackSize++] = cStart;
			} else {
				for (int i = 0; i < cCount; i++) {
					int     triIdx = getPoolTriangleIndex(triangles, cStart, i);
					vec3    v0, v1, v2;
					getVertices(v0, v1, v2, triangles, triIdx);
					HitInfo hit    = rayTriangleIntersection(origin, direction, v0, v1, v2, triIdx);
					if (hit.index != -1 && hit.distance < closest.distance) closest = hit;
				}
			}
		}
	}

	return closest;
}

void main() {
	ivec2 size  = textureSize(u_prev, 0);
	ivec2 coord = ivec2(gl_FragCoord.xy);
	int rayBase = (coord.y * size.x + coord.x) * 6;

	vec3 origin    = vec3(getData(u_ray, rayBase),     getData(u_ray, rayBase + 1), getData(u_ray, rayBase + 2));
	vec3 direction = vec3(getData(u_ray, rayBase + 3), getData(u_ray, rayBase + 4), getData(u_ray, rayBase + 5));

	vec3 color      = vec3(0.0);
	vec3 throughput = vec3(1.0);

	uint seed = uint(coord.x + coord.y * size.x + u_frame * size.x * size.y);

	for (int bounce = 0; bounce < 5; bounce++) {
		HitInfo hit = rayBVHIntersection(u_boundingBoxes, u_triangles, origin, direction);

		if (hit.index == -1) {
			color += throughput * vec3(0.5);
			break;
		}

		vec3 v0, v1, v2;
		getVertices(v0, v1, v2, u_triangles, hit.index);
		vec3 normal = normalize(cross(v1 - v0, v2 - v0));

		if (dot(normal, direction) > 0.0) normal = -normal;

		vec3 newDirection = alignedHemisphereSample(normal, seed);

		color      += throughput * getLuminosity(u_triangles, hit.index);
		throughput *= getColor(u_triangles, hit.index) * dot(normal, newDirection) * 2.0;
		origin      = origin + direction * hit.distance;
		direction   = newDirection;
	}

	vec3 prev = texture(u_prev, v_uv).rgb;
	fragColor  = vec4(mix(prev, color, 1.0 / float(u_frame + 1)), 1.0);
}