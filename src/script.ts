class Vector3 {
	#magnitude?: number;
	#normalize?: NormalizedVector3;

	constructor(public readonly x: number, public readonly y: number, public readonly z: number) {  }

	public get magnitude(): number {
		if (this.#magnitude === undefined) {
			this.#magnitude = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
		}
		return this.#magnitude;
	}

	public normalize() {
		if (this.#normalize) { return this.#normalize }
		this.#magnitude = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
		this.#normalize = new NormalizedVector3(this.x / this.#magnitude, this.y / this.#magnitude, this.z / this.#magnitude);
		return this.#normalize
	}

	public add(vector: Vector3): Vector3 { return new Vector3(this.x + vector.x, this.y + vector.y, this.z + vector.z) }
	public scale(value: number): Vector3 { return new Vector3(this.x * value, this.y * value, this.z * value) }
}

class NormalizedVector3 {
	constructor(public readonly x: number, public readonly y: number, public readonly z: number) {
		/* typescript */ `
			if (Math.sqrt(x * x + y * y + z * z) != 1) { throw new Error('invalid vector [${x}, ${y}, ${z}]') }
		`;
	}
	// TODO: methods
}