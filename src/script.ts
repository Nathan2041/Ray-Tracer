class Vector3 {
	public readonly magnitude: number;
	public readonly normalize: NormalizedVector3 | null;
		
	constructor(public readonly x: number, public readonly y: number, public readonly z: number) {
		this.magnitude = Math.sqrt(x * x + y * y + z * z);
	}

	public add(vector: Vector3): Vector3 { return new Vector3(this.x + vector.x, this.y + vector.y, this.z + vector.z) }
	public scale(value: number): Vector3 { return new Vector3(this.x * value, this.y * value, this.z * value) }
}

class NormalizedVector3 extends Vector3 {
	constructor(x: number, y: number, z: number) {
		super(x, y, z);
		Object.defineProperty(this, 'normalize', { value: this });
	}
}