import MTLFile from 'mtl-file-parser'
import OBJFile from 'obj-file-parser'
import { loadGltf } from 'node-three-gltf'

// #region classes
class Vector3 {
	#magnitude?: number;
	#normalize?: NormalizedVector3;

	public constructor(public readonly x: number, public readonly y: number, public readonly z: number) {  }

	public get magnitude(): number {
		if (this.#magnitude === undefined) { this.#magnitude = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z) }
		return this.#magnitude
	}

	public normalize() {
		if (this.#normalize) { return this.#normalize }
		this.#magnitude = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
		this.#normalize = new NormalizedVector3(this.x / this.#magnitude, this.y / this.#magnitude, this.z / this.#magnitude);
		return this.#normalize
	}

	public add(vector: Vector3): Vector3 { return new Vector3(this.x + vector.x, this.y + vector.y, this.z + vector.z) }
	public scale(value: number): Vector3 { return new Vector3(this.x * value, this.y * value, this.z * value) }
	public dot(vector: Vector3): number { return this.x * vector.x + this.y * vector.y + this.z * vector.z }
	public cross(vector: Vector3): Vector3 {
		return new Vector3(
			this.y * vector.z - this.z * vector.y,
			this.z * vector.x - this.x * vector.z,
			this.x * vector.y - this.y * vector.x
		)
	}
}

class NormalizedVector3 extends Vector3 {
	public constructor(x: number, y: number, z: number) {
		// if (Math.abs(Math.sqrt(x * x + y * y + z * z) - 1) < epsilon) { throw new Error('invalid vector [${x}, ${y}, ${z}]') }
		
		super(x, y, z);
	}

	public override get magnitude(): 1 { return 1 };
	public override normalize(): NormalizedVector3 { return this }
}

class Triangle {
	#edge1?: Vector3;
	#edge2?: Vector3;
	public constructor(
		public readonly vertex0: Vector3,
		public readonly vertex1: Vector3,
		public readonly vertex2: Vector3,
		public readonly color: Vector3 = defaultColor
	) {}

	public edge1(): Vector3 {
		if (this.#edge1) { return this.#edge1 }

		this.#edge1 = new Vector3(
			this.vertex1.x - this.vertex0.x,
			this.vertex1.y - this.vertex0.y,
			this.vertex1.z - this.vertex0.z
		);
		return this.#edge1
	}

	public edge2(): Vector3 {
		if (this.#edge2) { return this.#edge2 }

		this.#edge2 = new Vector3(
			this.vertex2.x - this.vertex0.x,
			this.vertex2.y - this.vertex0.y,
			this.vertex2.z - this.vertex0.z
		);

		return this.#edge2
	}
}

class Camera {
	public constructor(
		public readonly position: Vector3,
		public readonly direction: NormalizedVector3,
		public readonly fov: number,
		public readonly aspect: number,
		public readonly near: number,
		// public readonly far: number,
		// public readonly cameraUp: NormalizedVector3
	) {}
	
	public rays(height: number): NormalizedVector3[] {
		let width: number = height * this.aspect;
		let up: NormalizedVector3 = Math.abs(this.direction.dot(worldUp)) > 1 - epsilon ? worldForward : worldUp;
		let right: NormalizedVector3 = this.direction.cross(up).normalize();
		let cameraUp: NormalizedVector3 = right.cross(this.direction).normalize();
		let result: NormalizedVector3[] = [];
	
		for (let row: number = 0; row < height; row++) {
			let v: number = Math.tan(this.fov / 2) * (1 - (2 * (row + 0.5)) / height);
			for (let col: number = 0; col < width; col++) {
				let u: number = Math.tan(this.fov / 2) * this.aspect * ((2 * (col + 0.5)) / width - 1);
				result.push(this.direction.add(right.scale(u)).add(cameraUp.scale(v)).normalize());
			}
		}
	
		return result
	}
}

class Scene {
	public constructor(public readonly triangles: Triangle[], public readonly camera: Camera) {}
}

class Ray {
	public constructor(public readonly origin: Vector3, public readonly direction: NormalizedVector3) {}
}

type HitInfo = { didHit: false } | { didHit: true, distance: number, u: number, v: number };
// #endregion

const worldUp = new NormalizedVector3(0, 1, 0);
const worldForward = new NormalizedVector3(0, 0, 1);

let epsilon: number = 1e-8 as const;
let defaultColor = new Vector3(0.5, 0.5, 0.5);

// Load object
// Format into Scene

// Return color of triangle
/* // Lambertian Ray Tracing */


function rayTriangleIntersection(
	ray: Ray,
	triangle: Triangle
): HitInfo {
	let rayOrigin: Vector3 = ray.origin;
	let rayDirection: Vector3 = ray.direction;

	let vertex0: Vector3 = triangle.vertex0;
	let edge1: Vector3 = triangle.edge1();
	let edge2: Vector3 = triangle.edge2();

	let triangleNormal: Vector3 = edge1.cross(edge2);

	let normalDotRay: number = triangleNormal.dot(rayDirection);
	if (Math.abs(normalDotRay) < epsilon) { return { didHit: false } }

	let rayToVertex: Vector3 = vertex0.add(rayOrigin.scale(-1));
	let distanceToPlane: number = triangleNormal.dot(rayToVertex) / normalDotRay;

	if (distanceToPlane < epsilon) { return { didHit: false } }

	let intersectionPoint: Vector3 = rayOrigin.add(rayDirection.scale(distanceToPlane));

	let vertexToIntersectionPoint: Vector3 = intersectionPoint.add(vertex0.scale(-1));

	let normalSquaredMagnitude: number = triangleNormal.dot(triangleNormal);
	
	let crossProduct0: Vector3 = edge1.cross(vertexToIntersectionPoint);
	let crossProduct1: Vector3 = vertexToIntersectionPoint.cross(edge2);

	let barycentricU: number = triangleNormal.dot(crossProduct1) / normalSquaredMagnitude;
	if (barycentricU < 0.0 || barycentricU > 1.0) { return { didHit: false } }

	let barycentricV: number = triangleNormal.dot(crossProduct0) / normalSquaredMagnitude;
	if (barycentricV < 0.0 || barycentricU + barycentricV > 1.0) { return { didHit: false } }

	return { didHit: true, distance: distanceToPlane, u: barycentricU, v: barycentricV }
}

function uniformHemisphereSample(): NormalizedVector3 {
	let phi: number = 2 * Math.PI * Math.random();
	let cosTheta: number = Math.random();
	let sinTheta: number = Math.sqrt(1 - cosTheta * cosTheta);

	return new NormalizedVector3(
		sinTheta * Math.cos(phi),
		sinTheta * Math.sin(phi),
		cosTheta
	)
}