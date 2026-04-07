// TODO: use default camera if possible

// import MTLFile from 'mtl-file-parser'
// import OBJFile from 'obj-file-parser'

import type { MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'

export {};

declare global {
	interface Array<T> {
		triangleIndices(): number[];
	}
}

Array.prototype.triangleIndices = function (): number[] {
	if (!(this[0] instanceof Triangle)) { throw new Error(`cannot run triangleIndices on array not of type triangle`) }
	return this.map((triangle) => triangle.index)
};

// #region classes
class Vector3 {
	#magnitude?: number;
	#normalize?: NormalizedVector3;

	public constructor(public x: number, public y: number, public z: number) {}

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
		public readonly color: Vector3 = defaultColor,
		public readonly index: number
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
	
	public rays(height: number): Ray[] {
		let width: number = height * this.aspect;
		let up: NormalizedVector3 = Math.abs(this.direction.dot(worldUp)) > 1 - epsilon ? worldForward : worldUp;
		let right: NormalizedVector3 = this.direction.cross(up).normalize();
		let cameraUp: NormalizedVector3 = right.cross(this.direction).normalize();
		let result: Ray[] = [];
	
		for (let row: number = 0; row < height; row++) {
			let v: number = Math.tan(this.fov / 2) * (1 - (2 * (row + 0.5)) / height);
			for (let col: number = 0; col < width; col++) {
				let u: number = Math.tan(this.fov / 2) * this.aspect * ((2 * (col + 0.5)) / width - 1);
				result.push({ origin: this.position, direction: this.direction.add(right.scale(u)).add(cameraUp.scale(v)).normalize()});
			}
		}
	
		return result
	}
}

class BoundingBox {
	public max: Vector3;
	public min: Vector3;
	public children: [BoundingBox | Triangle[], BoundingBox | Triangle[]];
	public constructor(public readonly vertices: Vector3[], public readonly triangles: Triangle[]) {
		this.min = new Vector3(vertices[0].x, vertices[0].y, vertices[0].z);
		this.max = new Vector3(vertices[0].x, vertices[0].y, vertices[0].z);
		for (let i = 1; i < vertices.length; i++) {
			if (vertices[i].x < this.min.x) { this.min.x = vertices[i].x }
			if (vertices[i].y < this.min.y) { this.min.y = vertices[i].y }
			if (vertices[i].z < this.min.z) { this.min.z = vertices[i].z }
			if (vertices[i].x > this.max.x) { this.max.x = vertices[i].x }
			if (vertices[i].y > this.max.y) { this.max.y = vertices[i].y }
			if (vertices[i].z > this.max.z) { this.max.z = vertices[i].z }
		}
		
		let extent = new Vector3(
			this.max.x - this.min.x,
			this.max.y - this.min.y,
			this.max.z - this.min.z
		);
			
		let axis: 'x' | 'y' | 'z' = extent.x > extent.y && extent.x > extent.z ? 'x' : extent.y > extent.z ? 'y' : 'z';
		
		let sortedVertices: Vector3[] = vertices.sort((a: Vector3, b: Vector3): number => a[axis] - b[axis]);
		let childrenVertices: [Vector3[], Vector3[]] = [
			sortedVertices.slice(0, sortedVertices.length / 2 - 0.5),
			sortedVertices.slice(sortedVertices.length / 2 - 0.5)
		];
		
		let vertexSets: [Set<Vector3>, Set<Vector3>] = [new Set<Vector3>(childrenVertices[0]), new Set<Vector3>(childrenVertices[1])];
		let childrenTriangles: [Triangle[], Triangle[]] = [
			triangles.filter((triangle: Triangle): boolean =>
				vertexSets[0].has(triangle.vertex0) || vertexSets[0].has(triangle.vertex1) || vertexSets[0].has(triangle.vertex2)
			),
			
			triangles.filter((triangle: Triangle): boolean =>
				vertexSets[1].has(triangle.vertex0) || vertexSets[1].has(triangle.vertex1) || vertexSets[1].has(triangle.vertex2)
			)
		];

		this.children = [
			childrenTriangles[0].length > triangleThreshold ? new BoundingBox(
				childrenVertices[0],
				childrenTriangles[0]
			) : childrenTriangles[0],
			childrenTriangles[1].length > triangleThreshold ? new BoundingBox(
				childrenVertices[1],
				childrenTriangles[1]
			) : childrenTriangles[1]
		];
	}
}

interface Ray {
	origin: Vector3,
	direction: NormalizedVector3
}

type HitInfo = { didHit: false } | { didHit: true, distance: number, u: number, v: number, index: number };
// #endregion

let canvas: HTMLCanvasElement = document.createElement('canvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
document.body.appendChild(canvas);

document.body.style.margin = '0';
document.body.style.padding = '0';
document.body.style.overflow = 'hidden';
document.body.style.backgroundColor = 'black';
canvas.style.display = 'block';
canvas.style.imageRendering = 'pixelated';

let ctx: CanvasRenderingContext2D = canvas.getContext('2d')!;
let imageData: ImageData = ctx.createImageData(canvas.width, canvas.height);

const worldUp = new NormalizedVector3(0, 1, 0);
const worldForward = new NormalizedVector3(0, 0, 1);

let epsilon: number = 1e-8;
let defaultColor = new Vector3(0, 1, 0);
let backgroundColor = new Vector3(1, 0, 0);
let chunkSize: number = 100;
let fov: number = Math.PI / 4 + 0.1;
let triangleThreshold: number = 5;

let loader = new GLTFLoader();
let bunny: GLTF = await loader.loadAsync('/bunny.gltf');

let triangles: Triangle[] = [];
let vertices: Vector3[] = [];

bunny.scene.traverse((child: any): void => {
	if (child.isMesh) {
		let positions = child.geometry.attributes.position.array as Float32Array;
		let indices = child.geometry.index!.array as Uint32Array;
		let material: MeshStandardMaterial = child.material;

		for (let i = 0; i < indices.length; i += 3) {
			triangles.push(new Triangle(
				new Vector3(positions[indices[i]     * 3], positions[indices[i]     * 3 + 1], positions[indices[i]     * 3 + 2]),
				new Vector3(positions[indices[i + 1] * 3], positions[indices[i + 1] * 3 + 1], positions[indices[i + 1] * 3 + 2]),
				new Vector3(positions[indices[i + 2] * 3], positions[indices[i + 2] * 3 + 1], positions[indices[i + 2] * 3 + 2]),
				new Vector3(material.color.r, material.color.g, material.color.b),
				triangles.length - 1
			));
		}
		
		for (let i = 0; i < positions.length; i += 3) {
			vertices.push(new Vector3(positions[i], positions[i + 1], positions[i + 2]));
		}

		// console.log({
		// 	triangles,
		// 	color:     material.color,
		// 	map:       material.map,
		// 	emissive:  material.emissive,
		// 	roughness: material.roughness,
		// 	metalness: material.metalness,
		// 	normalMap: material.normalMap,
		// });
	}
});

let camera = new Camera(new Vector3(0, 0.098, 0.2), new NormalizedVector3(0, 0, -1), fov /* shoulld be constant? */, window.innerWidth / window.innerHeight, epsilon);
let rays: Ray[] = camera.rays(window.innerHeight);
let hierarchy = new BoundingBox(vertices, triangles);

for (let i = 0; i < rays.length; i++) {
	if (i % chunkSize == 0) {
		ctx.putImageData(imageData, 0, 0);
		await new Promise(resolve => setTimeout(resolve, 0));
	}
	
	let closestHitInfo: HitInfo | null = null;
	let color: Vector3 | null = null;
	let currentPrimitive: BoundingBox | Triangle[] = hierarchy;
	
	function hierarch(): void {
		let isChild0Intersecting: boolean = currentPrimitive.children[0] instanceof BoundingBox ? rayAABBIntersection(rays[i], currentPrimitive.children[0]) : rayTrianglesIntersection(rays[i], currentPrimitive.children[0]).didHit;
		let isChild1Intersecting: boolean = currentPrimitive.children[1] instanceof BoundingBox ? rayAABBIntersection(rays[i], currentPrimitive.children[1]) : rayTrianglesIntersection(rays[i], currentPrimitive.children[1]).didHit;
		if (!isChild0Intersecting && !isChild1Intersecting) { color = backgroundColor; return }
		if (isChild0Intersecting && !isChild1Intersecting) {
			if (currentPrimitive.children[0] instanceof BoundingBox) {
				currentPrimitive = currentPrimitive.children[0];
				hierarch();
			}
			else {
				closestHitInfo = rayTrianglesIntersection(rays[i], currentPrimitive.children[0]);
				return
			}
		}
		
		if (isChild1Intersecting && !isChild0Intersecting) {
			if (currentPrimitive.children[1] instanceof BoundingBox) {
				currentPrimitive = currentPrimitive.children[1];
				hierarch();
			}
			else {
				closestHitInfo = rayTrianglesIntersection(rays[i], currentPrimitive.children[1]);
				return
			}
		}
		
		let distance: number = Infinity;
		
		if (isChild0Intersecting && !(currentPrimitive.children[0] instanceof BoundingBox)) {
			let hitInfo: HitInfo = rayTrianglesIntersection(rays[i], currentPrimitive.children[0]);
			distance 
		}
	}
	
	hierarch();
	
	if (closestHitInfo == null) { color = backgroundColor }
	else {
		let normal: NormalizedVector3 = triangles[closestHitInfo.index].edge1().cross(triangles[closestHitInfo.index].edge2()).normalize();
		color = triangles[closestHitInfo.index].color.scale((normal.dot(worldUp) + 1) / 2);
	}
	

	let pixelIndex: number = i * 4;
	imageData.data[pixelIndex]     = color!.x * 255;
	imageData.data[pixelIndex + 1] = color!.y * 255;
	imageData.data[pixelIndex + 2] = color!.z * 255;
	imageData.data[pixelIndex + 3] = 255;
}

ctx.putImageData(imageData, 0, 0);

function rayTriangleIntersection(ray: Ray, triangle: Triangle): HitInfo {
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

	return { didHit: true, distance: distanceToPlane, u: barycentricU, v: barycentricV, index: triangle.index }
}

function rayAABBIntersection(ray: Ray, box: BoundingBox): boolean {
	let inverseDirection = new Vector3(1 / ray.direction.x, 1 / ray.direction.y, 1 / ray.direction.z);
	
	let tMinimum = new Vector3(
		(box.min.x - ray.origin.x) * inverseDirection.x,
		(box.min.y - ray.origin.y) * inverseDirection.y,
		(box.min.z - ray.origin.z) * inverseDirection.z
	);
	
	let tMaximum = new Vector3(
		(box.max.x - ray.origin.x) * inverseDirection.x,
		(box.max.y - ray.origin.y) * inverseDirection.y,
		(box.max.z - ray.origin.z) * inverseDirection.z
	);

	let tEnter: number = Math.max(Math.min(tMinimum.x, tMaximum.x), Math.min(tMinimum.y, tMaximum.y), Math.min(tMinimum.z, tMaximum.z));
	let tExit: number  = Math.min(Math.max(tMinimum.x, tMaximum.x), Math.max(tMinimum.y, tMaximum.y), Math.max(tMinimum.z, tMaximum.z));

	return tExit >= 0 && tEnter <= tExit;
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

function rayTrianglesIntersection(ray: Ray, triangles: Triangle[]): HitInfo {
	let hitInfo: HitInfo = { didHit: false };
	for (let i = 0; i < triangles.length; i++) {
		let _hitInfo: HitInfo = rayTriangleIntersection(ray, triangles[i], triangles[i].index);
		if (_hitInfo.didHit == false) { continue }
		if (hitInfo.didHit == false) { hitInfo = _hitInfo; continue }
		if (hitInfo.distance > _hitInfo.distance) { hitInfo = _hitInfo }
	}
	
	return hitInfo
}