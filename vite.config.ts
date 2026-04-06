import { defineConfig } from 'vite'

export default defineConfig({
	assetsInclude: ['**/*.gltf', '**/*.glb'],
	optimizeDeps: {
		include: ['three']
	},
	build: {
		commonjsOptions: {
			include: [/three/, /node_modules/]
		}
	}
})