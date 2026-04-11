import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import type { MeshStandardMaterial } from 'three';

let epsilon: number = 1e-8;

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
	public hadamard(vector: Vector3): Vector3 { return new Vector3(this.x * vector.x, this.y * vector.y, this.z * vector.z) }
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
		if (Math.abs(Math.sqrt(x * x + y * y + z * z) - 1) > epsilon) { throw new Error(`invalid vector [${x}, ${y}, ${z}]`) }
		
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
		public readonly index: number,
		public readonly luminosity: number
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
		let width: number = Math.round(height * this.aspect);
		let up: NormalizedVector3 = Math.abs(this.direction.dot(worldUp)) > 1 - epsilon ? worldForward : worldUp;
		let right: NormalizedVector3 = this.direction.cross(up).normalize();
		let cameraUp: NormalizedVector3 = right.cross(this.direction).normalize();
		let result: Ray[] = [];
	
		for (let row: number = 0; row < height; row++) {
			let v: number = Math.tan(this.fov / 2) * (1 - (2 * (row + 0.5)) / height);
			for (let collumn: number = 0; collumn < width; collumn++) {
				let u: number = Math.tan(this.fov / 2) * this.aspect * ((2 * (collumn + 0.5)) / width - 1);
				result.push({
					origin: this.position,
					direction: this.direction.add(right.scale(u)).add(cameraUp.scale(v)).normalize(),
					pixel: 4 * (row * width + collumn),
					color: new Vector3(0, 0, 0),
					throughput: new Vector3(1, 1, 1),
					hits: 0
				});
			}
		}

		return result
	}
}

class BoundingBox {
	public max: Vector3;
	public min: Vector3;
	public children: [BoundingBox | Triangle[], BoundingBox | Triangle[]];
	public constructor(public readonly triangles: Triangle[]) {
		let vertices: Vector3[] = triangles.flatMap(t => [t.vertex0, t.vertex1, t.vertex2]);
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
		
		let sortedTriangles: Triangle[] = [...triangles].sort((a: Triangle, b: Triangle): number =>
			(a.vertex0[axis] + a.vertex1[axis] + a.vertex2[axis]) - (b.vertex0[axis] + b.vertex1[axis] + b.vertex2[axis])
		);
		let mid: number = Math.floor(sortedTriangles.length / 2);
		let childrenTriangles: [Triangle[], Triangle[]] = [sortedTriangles.slice(0, mid), sortedTriangles.slice(mid)];

		this.children = [
			childrenTriangles[0].length > triangleThreshold ? new BoundingBox(childrenTriangles[0]) : childrenTriangles[0],
			childrenTriangles[1].length > triangleThreshold ? new BoundingBox(childrenTriangles[1]) : childrenTriangles[1]
		];
	}
}

type HitInfo = { didHit: false } | { didHit: true, distance: number, u: number, v: number, index: number };
// #endregion

interface Ray {
	origin: Vector3,
	direction: NormalizedVector3,
	pixel: number,
	color: Vector3,
	throughput: Vector3,
	hits: number
}

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

let defaultColor = new Vector3(0, 1, 0);
let backgroundColor = new Vector3(0.5, 0.5, 0.5);
let chunkSize: number = Infinity;
let fov: number = Math.PI / 4 + 0.1;
let triangleThreshold: number = 5;
let bounces: number = 5;

// TODO: make default to first given camera if there is one
let cameraPosition = new Vector3(0, 0.098, 0.2);
let cameraDirection = new NormalizedVector3(0, 0, -1);

let loader = new GLTFLoader();
let bunny: GLTF = await loader.loadAsync('/bunny.gltf');

let triangles: Triangle[] = [];
let vertices: Vector3[] = [];

bunny.scene.traverse((child: any): void => {
	if (child.isMesh) {
		let positions = child.geometry.attributes.position.array as Float32Array;
		let indices = child.geometry.index!.array as Uint32Array;
		let material: MeshStandardMaterial = child.material;

		for (let i = 0; i < positions.length; i += 3) {
			vertices.push(new Vector3(positions[i], positions[i + 1], positions[i + 2]));
		}
		
		for (let i = 0; i < indices.length; i += 3) {
			triangles.push(new Triangle(
				vertices[indices[i]],
				vertices[indices[i + 1]],
				vertices[indices[i + 2]],
				new Vector3(material.color.r, material.color.g, material.color.b),
				triangles.length,
				new Vector3(material.emissive.r, material.emissive.g, material.emissive.b).magnitude
			));
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

let bMin = new Vector3(-0.15, 0,    -0.2 );
let bMax = new Vector3( 0.15, 0.3, 0.25);

let white  = new Vector3(1,   1,   1  );
let green  = new Vector3(0,   1,   0  );
let red    = new Vector3(1,   0,   0  );
let blue   = new Vector3(0,   0,   1  );
let yellow = new Vector3(1,   1,   0  );
let purple = new Vector3(0.5, 0,   0.5);

// floor - white
triangles.push(new Triangle(new Vector3(bMin.x, bMin.y, bMin.z), new Vector3(bMax.x, bMin.y, bMin.z), new Vector3(bMax.x, bMin.y, bMax.z), white,  triangles.length, 0));
triangles.push(new Triangle(new Vector3(bMin.x, bMin.y, bMin.z), new Vector3(bMax.x, bMin.y, bMax.z), new Vector3(bMin.x, bMin.y, bMax.z), white,  triangles.length, 0));
// ceiling - green, emissive
triangles.push(new Triangle(new Vector3(bMin.x, bMax.y, bMin.z), new Vector3(bMax.x, bMax.y, bMax.z), new Vector3(bMax.x, bMax.y, bMin.z), green,  triangles.length, 1));
triangles.push(new Triangle(new Vector3(bMin.x, bMax.y, bMin.z), new Vector3(bMin.x, bMax.y, bMax.z), new Vector3(bMax.x, bMax.y, bMax.z), green,  triangles.length, 1));
// back wall - red
triangles.push(new Triangle(new Vector3(bMin.x, bMin.y, bMin.z), new Vector3(bMax.x, bMax.y, bMin.z), new Vector3(bMax.x, bMin.y, bMin.z), red,    triangles.length, 0));
triangles.push(new Triangle(new Vector3(bMin.x, bMin.y, bMin.z), new Vector3(bMin.x, bMax.y, bMin.z), new Vector3(bMax.x, bMax.y, bMin.z), red,    triangles.length, 0));
// left wall - yellow
triangles.push(new Triangle(new Vector3(bMin.x, bMin.y, bMin.z), new Vector3(bMin.x, bMax.y, bMax.z), new Vector3(bMin.x, bMax.y, bMin.z), yellow, triangles.length, 0));
triangles.push(new Triangle(new Vector3(bMin.x, bMin.y, bMin.z), new Vector3(bMin.x, bMin.y, bMax.z), new Vector3(bMin.x, bMax.y, bMax.z), yellow, triangles.length, 0));
// right wall - purple
triangles.push(new Triangle(new Vector3(bMax.x, bMin.y, bMin.z), new Vector3(bMax.x, bMax.y, bMin.z), new Vector3(bMax.x, bMax.y, bMax.z), purple, triangles.length, 0));
triangles.push(new Triangle(new Vector3(bMax.x, bMin.y, bMin.z), new Vector3(bMax.x, bMax.y, bMax.z), new Vector3(bMax.x, bMin.y, bMax.z), purple, triangles.length, 0));
// front wall - blue (behind camera, seals the box)
triangles.push(new Triangle(new Vector3(bMin.x, bMin.y, bMax.z), new Vector3(bMax.x, bMin.y, bMax.z), new Vector3(bMax.x, bMax.y, bMax.z), blue,   triangles.length, 0));
triangles.push(new Triangle(new Vector3(bMin.x, bMin.y, bMax.z), new Vector3(bMax.x, bMax.y, bMax.z), new Vector3(bMin.x, bMax.y, bMax.z), blue,   triangles.length, 0));

let camera = new Camera(cameraPosition, cameraDirection, fov, canvas.width / canvas.height, epsilon);
let rays: Ray[] = camera.rays(canvas.height);
let hierarchy = new BoundingBox(triangles);

let samples: number = 0;
let pixelColors: Vector3[] = rays.map(() => new Vector3(0, 0, 0));

while (true) {
	for (let i = 0; i < rays.length; i++) {
		let origin: Vector3 = rays[i].origin;
		let direction: NormalizedVector3 = rays[i].direction;
		let throughput: Vector3 = new Vector3(1, 1, 1);
		let color: Vector3 = new Vector3(0, 0, 0);

		for (let j = 0; j < bounces; j++) {
			let closestHitInfo: HitInfo = rayBVHIntersection({ origin, direction, pixel: rays[i].pixel, color: rays[i].color, throughput: rays[i].throughput, hits: rays[i].hits }, hierarchy);

			if (closestHitInfo.didHit) {
				let triangle: Triangle = triangles[closestHitInfo.index];
				let normal: NormalizedVector3 = triangle.edge1().cross(triangle.edge2()).normalize();
				if (normal.dot(direction) > 0) { normal = normal.scale(-1) as NormalizedVector3 }
				let newDirection: NormalizedVector3 = alignedHemisphereSample(normal);
				color = color.add(throughput.scale(triangle.luminosity));
				throughput = throughput.hadamard(triangle.color).scale(normal.dot(newDirection) * 2);
				origin = origin.add(direction.scale(closestHitInfo.distance));
				direction = newDirection;
			} else {
				color = color.add(throughput.hadamard(backgroundColor));
				break;
			}
		}

		pixelColors[i] = pixelColors[i].add(color.add(pixelColors[i].scale(-1)).scale(1 / (samples + 1)));

		imageData.data[rays[i].pixel]     = pixelColors[i].x * 255;
		imageData.data[rays[i].pixel + 1] = pixelColors[i].y * 255;
		imageData.data[rays[i].pixel + 2] = pixelColors[i].z * 255;
		imageData.data[rays[i].pixel + 3] =                    255;
	}

	samples++;
	ctx.putImageData(imageData, 0, 0);
	await new Promise(resolve => setTimeout(resolve, 0));
}


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

function rayAABBIntersection(ray: Ray, box: BoundingBox): number {
	let inverseDirection: Vector3 = new Vector3(1 / ray.direction.x, 1 / ray.direction.y, 1 / ray.direction.z);

	let tMinimum: Vector3 = new Vector3(
		(box.min.x - ray.origin.x) * inverseDirection.x,
		(box.min.y - ray.origin.y) * inverseDirection.y,
		(box.min.z - ray.origin.z) * inverseDirection.z
	);

	let tMaximum: Vector3 = new Vector3(
		(box.max.x - ray.origin.x) * inverseDirection.x,
		(box.max.y - ray.origin.y) * inverseDirection.y,
		(box.max.z - ray.origin.z) * inverseDirection.z
	);

	let tEnter: number = Math.max(Math.min(tMinimum.x, tMaximum.x), Math.min(tMinimum.y, tMaximum.y), Math.min(tMinimum.z, tMaximum.z));
	let tExit:  number = Math.min(Math.max(tMinimum.x, tMaximum.x), Math.max(tMinimum.y, tMaximum.y), Math.max(tMinimum.z, tMaximum.z));

	if (tExit < 0 || tEnter > tExit) { return Infinity }
	return tEnter
}

function alignedHemisphereSample(normal: NormalizedVector3): NormalizedVector3 {
	let phi: number = 2 * Math.PI * Math.random();
	let cosTheta: number = Math.random();
	let sinTheta: number = Math.sqrt(1 - cosTheta * cosTheta);

	let sample = new NormalizedVector3(
		sinTheta * Math.cos(phi),
		sinTheta * Math.sin(phi),
		cosTheta
	);
	
	let tangent: NormalizedVector3 = (Math.abs(normal.dot(worldUp)) > 1 - epsilon ? worldForward : worldUp).cross(normal).normalize();
	let bitangent: NormalizedVector3 = normal.cross(tangent).normalize();
	
	return new NormalizedVector3(
		sample.x * tangent.x   + sample.y * bitangent.x   + sample.z * normal.x,
		sample.x * tangent.y   + sample.y * bitangent.y   + sample.z * normal.y,
		sample.x * tangent.z   + sample.y * bitangent.z   + sample.z * normal.z
	)
}

function rayTrianglesIntersection(ray: Ray, triangles: Triangle[]): HitInfo {
	let hitInfo: HitInfo = { didHit: false };
	for (let i = 0; i < triangles.length; i++) {
		let _hitInfo: HitInfo = rayTriangleIntersection(ray, triangles[i]);
		if (_hitInfo.didHit == false) { continue }
		if (hitInfo.didHit == false) { hitInfo = _hitInfo; continue }
		if (hitInfo.distance > _hitInfo.distance) { hitInfo = _hitInfo }
	}
	
	return hitInfo
}

function rayBVHIntersection(ray: Ray, node: BoundingBox | Triangle[]): HitInfo {
	if (Array.isArray(node)) {
		return rayTrianglesIntersection(ray, node);
	}

	let tEnter: number = rayAABBIntersection(ray, node);
	if (tEnter === Infinity) { return { didHit: false } }

	let hit0: HitInfo = rayBVHIntersection(ray, node.children[0]);
	let hit1: HitInfo = rayBVHIntersection(ray, node.children[1]);

	if (!hit0.didHit && !hit1.didHit) { return { didHit: false } }
	if (!hit0.didHit) { return hit1 }
	if (!hit1.didHit) { return hit0 }
	return hit0.distance < hit1.distance ? hit0 : hit1;
}