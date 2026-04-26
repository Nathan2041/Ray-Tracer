import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import type { MeshStandardMaterial, NumberKeyframeTrack } from 'three';

import vertexSource from './vertex.glsl?raw'
import fragmentSource from './fragment.glsl?raw'

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
		public readonly vertices: [Vector3, Vector3, Vector3],
		public readonly color: Vector3 = defaultColor,
		public readonly index: number,
		public readonly luminosity: number
	) {}

	public edge1(): Vector3 {
		if (this.#edge1) { return this.#edge1 }

		this.#edge1 = new Vector3(
			this.vertices[1].x - this.vertices[0].x,
			this.vertices[1].y - this.vertices[0].y,
			this.vertices[1].z - this.vertices[0].z
		);
		return this.#edge1
	}

	public edge2(): Vector3 {
		if (this.#edge2) { return this.#edge2 }

		this.#edge2 = new Vector3(
			this.vertices[2].x - this.vertices[0].x,
			this.vertices[2].y - this.vertices[0].y,
			this.vertices[2].z - this.vertices[0].z
		);

		return this.#edge2
	}
}
// Tuple<number, 14> [vertices[0].x, vertices[0].y, vertices[0].z, vertices[1].x, vertices[1].y, vertices[1].z, vertices[2].x, vertices[2].y, vertices[2].z, color.x, color.y, color.z, index, luminosity]

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
			for (let column: number = 0; column < width; column++) {
				let u: number = Math.tan(this.fov / 2) * this.aspect * ((2 * (column + 0.5)) / width - 1);
				result.push({
					origin: this.position,
					direction: this.direction.add(right.scale(u)).add(cameraUp.scale(v)).normalize(),
					pixel: 4 * (row * width + column),
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
		let vertices: Vector3[] = triangles.flatMap(t => [t.vertices[0], t.vertices[1], t.vertices[2]]);
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
			(a.vertices[0][axis] + a.vertices[1][axis] + a.vertices[2][axis]) - (b.vertices[0][axis] + b.vertices[1][axis] + b.vertices[2][axis])
		);
		let mid: number = Math.floor(sortedTriangles.length / 2);
		let childrenTriangles: [Triangle[], Triangle[]] = [sortedTriangles.slice(0, mid), sortedTriangles.slice(mid)];

		this.children = [
			childrenTriangles[0].length > triangleThreshold ? new BoundingBox(childrenTriangles[0]) : childrenTriangles[0],
			childrenTriangles[1].length > triangleThreshold ? new BoundingBox(childrenTriangles[1]) : childrenTriangles[1]
		];
	}
}
// #endregion

type Element = [number[], number[]];
type HitInfo = { didHit: false } | { didHit: true, distance: number, u: number, v: number, index: number };
type Tuple<T, N extends number, R extends T[] = []> = R['length'] extends N ? R : Tuple<T, N, [T, ...R]>;

interface Ray {
	origin: Vector3,
	direction: NormalizedVector3,
	pixel: number,
	color: Vector3,
	throughput: Vector3,
	hits: number
}

interface BoundingBoxNode {
	max: Vector3,
	min: Vector3,
	children: [BoundingBoxNode | Triangle[], BoundingBoxNode | Triangle[]]
}

interface StoredBoundingBoxNode {
	index: number,
	max: Vector3,
	min: Vector3,
	children?: [StoredBoundingBoxNode | Triangle[] | null, StoredBoundingBoxNode | Triangle[] | null]
}

const worldUp = new NormalizedVector3(0, 1, 0);
const worldForward = new NormalizedVector3(0, 0, 1);

let defaultColor = new Vector3(0, 1, 0);
let backgroundColor = new Vector3(0.5, 0.5, 0.5);
let chunkSize: number = Infinity;
let fov: number = Math.PI / 4 + 0.1;
let triangleThreshold: number = 5;
let bounces: number = 5;

let defaultCameraPosition = new Vector3(0, 0.098, 0.2);
let defaultCameraDirection = new NormalizedVector3(0, 0, -1);

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

let loader = new GLTFLoader();
let bunny: GLTF = await loader.loadAsync('/bunny.gltf');

let triangles: Triangle[] = [];
let vertices: Vector3[] = [];
let camera = new Camera(defaultCameraPosition, defaultCameraDirection, fov, canvas.width / canvas.height, epsilon);

// #region traversal
if (bunny.cameras.length > 0) {
	let child: any = bunny.cameras[0];
	camera = new Camera(
		new Vector3(child.position.x, child.position.y, child.position.z),
		child.getWorldDirection(new Vector3(0, 0, 0)) as unknown as NormalizedVector3,
		child.fov * Math.PI / 180,
		child.aspect,
		child.near
	);
}

bunny.scene.traverse((child: any): void => {
	if (child.isMesh) {
		let positions = child.geometry.attributes.position.array as Float32Array;
		let indices = child.geometry.index!.array as Uint32Array;
		let material: MeshStandardMaterial = child.material;
		
		if (child.isCamera) {
			camera = new Camera(
				new Vector3(child.position.x, child.position.y, child.position.z),
				child.getWorldDirection(new Vector3(0, 0, 0)) as unknown as NormalizedVector3,
				child.fov * Math.PI / 180,
				child.aspect,
				child.near
			);
		}

		for (let i = 0; i < positions.length; i += 3) {
			vertices.push(new Vector3(positions[i], positions[i + 1], positions[i + 2]));
		}
		
		for (let i = 0; i < indices.length; i += 3) {
			triangles.push(new Triangle(
				[
					vertices[indices[i]],
					vertices[indices[i + 1]],
					vertices[indices[i + 2]]
				],
				new Vector3(material.color.r, material.color.g, material.color.b),
				triangles.length,
				new Vector3(material.emissive.r, material.emissive.g, material.emissive.b).magnitude
			));
		}

		// console.log({
		// 	map:       material.map,
		// 	roughness: material.roughness,
		// 	metalness: material.metalness,
		// 	normalMap: material.normalMap,
		// });
	}
});
// #endregion

let rays: Ray[] = camera.rays(canvas.height);
let hierarchy = new BoundingBox(triangles);

// #region boilerplate
let gl: WebGL2RenderingContext = canvas.getContext('webgl2')!;
gl.getExtension('EXT_color_buffer_float');

function compile(type: number, source: string): WebGLShader {
	let shader: WebGLShader = gl.createShader(type)!;
	gl.shaderSource(shader, source.slice(source.indexOf('#version')));
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { throw gl.getShaderInfoLog(shader) }
	return shader;
}

let program: WebGLProgram = gl.createProgram();
gl.attachShader(program, compile(gl.VERTEX_SHADER,   vertexSource));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { throw gl.getProgramInfoLog(program) }

let vao: WebGLVertexArrayObject = gl.createVertexArray();
gl.bindVertexArray(vao);

let buffer: WebGLBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(
	gl.ARRAY_BUFFER,
	new Float32Array([-1,-1, 3,-1, -1,3]),
	gl.STATIC_DRAW
);

gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

let uTime:  WebGLUniformLocation = gl.getUniformLocation(program, 'u_time')!;
let uFrame: WebGLUniformLocation = gl.getUniformLocation(program, 'u_frame')!;
let uPrev:  WebGLUniformLocation = gl.getUniformLocation(program, 'u_prev')!;

function makeTarget(w: number, h: number): { texture: WebGLTexture, fbo: WebGLFramebuffer } {
	let texture: WebGLTexture = gl.createTexture()!;
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

	let fbo: WebGLFramebuffer = gl.createFramebuffer()!;
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
	return { texture, fbo };
}

let ping: { texture: WebGLTexture, fbo: WebGLFramebuffer } = makeTarget(canvas.width, canvas.height);
let pong: { texture: WebGLTexture, fbo: WebGLFramebuffer } = makeTarget(canvas.width, canvas.height);
let frame: number = 0;
// #endregion

let maxTextureSize: bigint = BigInt(gl.getParameter(gl.MAX_TEXTURE_SIZE)); maxTextureSize *= maxTextureSize * 4n;

function render(time: number): void {
	gl.viewport(0, 0, canvas.width, canvas.height);
	gl.useProgram(program);
	gl.bindVertexArray(vao);
	gl.uniform1f(uTime,  time * 0.001);
	gl.uniform1i(uFrame, frame);
	gl.uniform1i(uPrev,  0);

	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, ping.texture);
	gl.bindFramebuffer(gl.FRAMEBUFFER, pong.fbo);
	gl.drawArrays(gl.TRIANGLES, 0, 3);

	gl.bindTexture(gl.TEXTURE_2D, pong.texture);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.drawArrays(gl.TRIANGLES, 0, 3);

	[ping, pong] = [pong, ping];
	frame++;
	requestAnimationFrame(render);
}

requestAnimationFrame(render);

// #region box
let bMin = new Vector3(-0.15, 0,    -0.2 );
let bMax = new Vector3( 0.15, 0.3, 0.25);

let white  = new Vector3(1,   1,   1  );
let green  = new Vector3(0,   1,   0  );
let red    = new Vector3(1,   0,   0  );
let blue   = new Vector3(0,   0,   1  );
let yellow = new Vector3(1,   1,   0  );
let purple = new Vector3(0.5, 0,   0.5);

// floor - white
triangles.push(new Triangle([new Vector3(bMin.x, bMin.y, bMin.z), new Vector3(bMax.x, bMin.y, bMin.z), new Vector3(bMax.x, bMin.y, bMax.z)], white,  triangles.length, 0));
triangles.push(new Triangle([new Vector3(bMin.x, bMin.y, bMin.z), new Vector3(bMax.x, bMin.y, bMax.z), new Vector3(bMin.x, bMin.y, bMax.z)], white,  triangles.length, 0));
// ceiling - green, emissive
triangles.push(new Triangle([new Vector3(bMin.x, bMax.y, bMin.z), new Vector3(bMax.x, bMax.y, bMax.z), new Vector3(bMax.x, bMax.y, bMin.z)], green,  triangles.length, 1));
triangles.push(new Triangle([new Vector3(bMin.x, bMax.y, bMin.z), new Vector3(bMin.x, bMax.y, bMax.z), new Vector3(bMax.x, bMax.y, bMax.z)], green,  triangles.length, 1));
// back wall - red
triangles.push(new Triangle([new Vector3(bMin.x, bMin.y, bMin.z), new Vector3(bMax.x, bMax.y, bMin.z), new Vector3(bMax.x, bMin.y, bMin.z)], red,    triangles.length, 0));
triangles.push(new Triangle([new Vector3(bMin.x, bMin.y, bMin.z), new Vector3(bMin.x, bMax.y, bMin.z), new Vector3(bMax.x, bMax.y, bMin.z)], red,    triangles.length, 0));
// left wall - yellow
triangles.push(new Triangle([new Vector3(bMin.x, bMin.y, bMin.z), new Vector3(bMin.x, bMax.y, bMax.z), new Vector3(bMin.x, bMax.y, bMin.z)], yellow, triangles.length, 0));
triangles.push(new Triangle([new Vector3(bMin.x, bMin.y, bMin.z), new Vector3(bMin.x, bMin.y, bMax.z), new Vector3(bMin.x, bMax.y, bMax.z)], yellow, triangles.length, 0));
// right wall - purple
triangles.push(new Triangle([new Vector3(bMax.x, bMin.y, bMin.z), new Vector3(bMax.x, bMax.y, bMin.z), new Vector3(bMax.x, bMax.y, bMax.z)], purple, triangles.length, 0));
triangles.push(new Triangle([new Vector3(bMax.x, bMin.y, bMin.z), new Vector3(bMax.x, bMax.y, bMax.z), new Vector3(bMax.x, bMin.y, bMax.z)], purple, triangles.length, 0));
// front wall - blue (behind camera, seals the box)
triangles.push(new Triangle([new Vector3(bMin.x, bMin.y, bMax.z), new Vector3(bMax.x, bMin.y, bMax.z), new Vector3(bMax.x, bMax.y, bMax.z)], blue,   triangles.length, 0));
triangles.push(new Triangle([new Vector3(bMin.x, bMin.y, bMax.z), new Vector3(bMax.x, bMax.y, bMax.z), new Vector3(bMin.x, bMax.y, bMax.z)], blue,   triangles.length, 0));
// #endregion

// #region loop
// while (true) {
// 	for (let i = 0; i < rays.length; i++) {
// 		let origin: Vector3 = rays[i].origin;
// 		let direction: NormalizedVector3 = rays[i].direction;
// 		let throughput: Vector3 = new Vector3(1, 1, 1);
// 		let color: Vector3 = new Vector3(0, 0, 0);
// 
// 		for (let j = 0; j < bounces; j++) {
// 			let closestHitInfo: HitInfo = rayBVHIntersection({ origin, direction, pixel: rays[i].pixel, color: rays[i].color, throughput: rays[i].throughput, hits: rays[i].hits }, hierarchy);
// 
// 			if (closestHitInfo.didHit) {
// 				let triangle: Triangle = triangles[closestHitInfo.index];
// 				let normal: NormalizedVector3 = triangle.edge1().cross(triangle.edge2()).normalize();
// 				if (normal.dot(direction) > 0) { normal = normal.scale(-1) as NormalizedVector3 }
// 				let newDirection: NormalizedVector3 = alignedHemisphereSample(normal);
// 				color = color.add(throughput.scale(triangle.luminosity));
// 				throughput = throughput.hadamard(triangle.color).scale(normal.dot(newDirection) * 2);
// 				origin = origin.add(direction.scale(closestHitInfo.distance));
// 				direction = newDirection;
// 			} else {
// 				color = color.add(throughput.hadamard(backgroundColor));
// 				break;
// 			}
// 		}
// 
// 		pixelColors[i] = pixelColors[i].add(color.add(pixelColors[i].scale(-1)).scale(1 / (samples + 1)));
// 
// 		imageData.data[rays[i].pixel]     = pixelColors[i].x * 255;
// 		imageData.data[rays[i].pixel + 1] = pixelColors[i].y * 255;
// 		imageData.data[rays[i].pixel + 2] = pixelColors[i].z * 255;
// 		imageData.data[rays[i].pixel + 3] =                    255;
// 	}
// 
// 	samples++;
// 	ctx.putImageData(imageData, 0, 0);
// 	await new Promise(resolve => setTimeout(resolve, 0));
// }
// #endregion

// #region functions
function rayTriangleIntersection(ray: Ray, triangle: Triangle): HitInfo {
	let rayOrigin: Vector3 = ray.origin;
	let rayDirection: Vector3 = ray.direction;

	let vertex0: Vector3 = triangle.vertices[0];
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

function flattenTree(node: BoundingBoxNode, index: number[] = []): [number[], StoredBoundingBoxNode | Triangle[]][] {
	let flatArray: [number[], StoredBoundingBoxNode | Triangle[]][] = [];
	let { children, ...rest } = node;
	flatArray.push([index, { ...rest, index: flatArray.length }]);
	
	for (let i = 0 as const; i < 2; i++) {
		if (Array.isArray(node.children[i])) { flatArray.push([[...index, i], node.children[i] as Triangle[]]); continue }
		flatArray.push(...flattenTree(node.children[i] as BoundingBoxNode, [...index, i]));
	}
	
	return flatArray
}

function classToArray(instantiation: StoredBoundingBoxNode | Triangle[]): number[] {
	let array: number[] = [];
	if (Array.isArray(instantiation)) {
		for (let triangle of instantiation as Triangle[]) {
			array.push(
				// triangle.index,
				triangle.color.x,
				triangle.color.y,
				triangle.color.z,
				triangle.vertices[0].x,
				triangle.vertices[0].y,
				triangle.vertices[0].z,
				triangle.vertices[1].x,
				triangle.vertices[1].y,
				triangle.vertices[1].z,
				triangle.vertices[2].x,
				triangle.vertices[2].y,
				triangle.vertices[2].z,
				triangle.luminosity
			);
		}
		
		return array
	}
	
	array.push(
		instantiation.index,
		instantiation.min.x,
		instantiation.min.y,
		instantiation.min.z,
		instantiation.max.x,
		instantiation.max.y,
		instantiation.max.z
	);
	
	for (let child of instantiation.children! as Tuple<Triangle[] | StoredBoundingBoxNode, 2>) {
		if (Array.isArray(child)) {
			for (let triangle of child as Triangle[]) { array.push(triangle.index) }
			array.push(NaN);
			continue
		}
		
		array.push(child.index);
		array.push(NaN);
	}
	
	array.push(NaN);
	
	return array
}

function makeTexture(gl: WebGL2RenderingContext, data: Float32Array): WebGLTexture {
	let pixels: number = Math.ceil(data.length / 4);
	let size: number = Math.ceil(Math.sqrt(pixels));

	let padded = new Float32Array(size * size * 4);
	padded.set(data);

	let texture: WebGLTexture = gl.createTexture()!;
	gl.bindTexture(gl.TEXTURE_2D, texture);

	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.RGBA32F,
		size,
		size,
		0,
		gl.RGBA,
		gl.FLOAT,
		padded
	);

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

	return texture
}

function packElements(gl: WebGL2RenderingContext, boundingBox: BoundingBox): { triangles: WebGLTexture, boundingBoxes: WebGLTexture } {
	let flatHierarchy: [number[], StoredBoundingBoxNode | Triangle[]][] = flattenTree(boundingBox);
	
	for (let i = 0; i < flatHierarchy.length; i++) {
		// TODO
	}
	
	return null as any as { triangles: WebGLTexture, boundingBoxes: WebGLTexture }
}

// function unflattenArray(array: [number[], storedTreeType | string][]): treeType {
// 	let tree: storedTreeType = {...(array[0][1] as storedTreeType), children: [null, null]};
// 	
// 	for (let i = 1; i < array.length; i++) {
// 		let node: storedTreeType = tree;
// 		for (let j = 0; j < array[i][0].length - 1; j++) {
// 			// @ts-expect-error
// 			node = node.children[array[i][0][j]];
// 		}
// 		node.children![array[i][0][array[i][0].length - 1]] = typeof array[i][1] == 'string'
// 			? array[i][1]
// 			: { ...(array[i][1] as storedTreeType), children: [null, null] };
// 	}
// 	
// 	return tree as treeType
// }
// #endregion