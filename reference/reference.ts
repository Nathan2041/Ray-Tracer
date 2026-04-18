// reference.ts — WebGL2 data API reference (no rendering)
let canvas: HTMLCanvasElement = document.createElement('canvas');
let gl: WebGL2RenderingContext = canvas.getContext('webgl2')!;

// #region extensions
// RGBA32F textures as render targets (you need this)
gl.getExtension('EXT_color_buffer_float');
// 32-bit float linear filtering (optional, you don't need it for data textures)
gl.getExtension('OES_texture_float_linear');
// #endregion

// #region textures
let texture: WebGLTexture = gl.createTexture()!;
// targets: TEXTURE_2D, TEXTURE_3D, TEXTURE_2D_ARRAY, TEXTURE_CUBE_MAP
gl.bindTexture(gl.TEXTURE_2D, texture);

// texImage2D(target, mipLevel, internalFormat, width, height, border, format, type, data)
// internalFormat (what the GPU stores):
//   gl.RGBA32F  — 4x 32-bit float (what you use for data textures)
//   gl.RGBA16F  — 4x 16-bit float (half precision, smaller)
//   gl.RGBA8    — 4x 8-bit unsigned (regular color)
//   gl.R32F     — 1x 32-bit float
//   gl.RG32F    — 2x 32-bit float
// format (what your data array is laid out as, must be compatible with internalFormat):
//   gl.RGBA     — matches RGBA32F, RGBA16F, RGBA8
//   gl.RED      — matches R32F
//   gl.RG       — matches RG32F
// type (the JS array element type):
//   gl.FLOAT         — Float32Array
//   gl.UNSIGNED_BYTE — Uint8Array
//   gl.HALF_FLOAT    — Uint16Array (packed halfs)
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, 100, 0, gl.RGBA, gl.FLOAT, new Float32Array(4 * 4 * 100));
// null data = allocate but don't fill (what makeTarget does)
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, canvas.width, canvas.height, 0, gl.RGBA, gl.FLOAT, null);

// filtering — always NEAREST for data textures, LINEAR only for color/visual textures
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); // minification
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); // magnification
// wrapping — irrelevant for data textures but here for completeness
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

// update a sub-region of an existing texture (avoid re-allocating)
// texSubImage2D(target, mipLevel, xOffset, yOffset, width, height, format, type, data)
gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 4, 1, gl.RGBA, gl.FLOAT, new Float32Array(16));

// binding textures to slots — slots 0..31 (at least), bind different textures to different slots
gl.activeTexture(gl.TEXTURE0); // select slot
gl.bindTexture(gl.TEXTURE_2D, texture); // bind texture to selected slot
// #endregion

// #region uniforms
let program: WebGLProgram = gl.createProgram()!;
// always call useProgram before setting uniforms
gl.useProgram(program);

let exampleLocation: WebGLUniformLocation = gl.getUniformLocation(program, 'u_example')!;

// scalars
gl.uniform1f(exampleLocation, 1.0);           // float
gl.uniform1i(exampleLocation, 0);             // int, also used for sampler2D slots

// vectors
gl.uniform2f(exampleLocation, 1.0, 2.0);      // vec2
gl.uniform3f(exampleLocation, 1.0, 2.0, 3.0); // vec3
gl.uniform4f(exampleLocation, 1.0, 2.0, 3.0, 4.0); // vec4

// arrays — pass a JS array or typed array directly
gl.uniform1fv(exampleLocation, [1.0, 2.0, 3.0]);   // float[]
gl.uniform2fv(exampleLocation, [1.0, 2.0, 3.0, 4.0]); // vec2[]
gl.uniform3fv(exampleLocation, new Float32Array(9)); // vec3[]

// matrices — third argument is whether to transpose (always false)
gl.uniformMatrix3fv(exampleLocation, false, new Float32Array(9));  // mat3
gl.uniformMatrix4fv(exampleLocation, false, new Float32Array(16)); // mat4
// #endregion

// #region buffers
let buffer: WebGLBuffer = gl.createBuffer()!;
// targets: ARRAY_BUFFER (vertex data), ELEMENT_ARRAY_BUFFER (index data), UNIFORM_BUFFER
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
// usage hints (don't affect correctness, only performance hints to the driver):
//   STATIC_DRAW  — written once, read many times
//   DYNAMIC_DRAW — written repeatedly, read many times
//   STREAM_DRAW  — written once, read a few times
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 2, 3]), gl.STATIC_DRAW);
// update sub-region of existing buffer
gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array([4, 5, 6]));
// #endregion

// #region vertex array objects
let vao: WebGLVertexArrayObject = gl.createVertexArray()!;
gl.bindVertexArray(vao);
// tells the shader which attribute slot to read from (matches `layout(exampleLocation = 0)` in glsl)
gl.enableVertexAttribArray(0);
// vertexAttribPointer(attributeSlot, componentCount, type, normalized, stride, offset)
// componentCount: 1-4
// stride: bytes between the start of each vertex (0 = tightly packed)
// offset: bytes from the start of the buffer to the first element
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
// #endregion

// #region framebuffers
let framebuffer: WebGLFramebuffer = gl.createFramebuffer()!;
gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
// attach a texture as the color output — what makeTarget does
// attachment: COLOR_ATTACHMENT0..31, DEPTH_ATTACHMENT, STENCIL_ATTACHMENT
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
// null = render to canvas
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
// #endregion