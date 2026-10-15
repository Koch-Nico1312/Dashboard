import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import {defineConfig} from 'vite'

// Separate graph: no umbreld providers, tRPC router, or OS onboarding.
export default defineConfig({
	plugins: [tailwindcss(), react()],
	resolve: {alias: {'@/': `${path.resolve(__dirname, 'src')}/`}},
	build: {outDir: 'dist-ubuntu', rollupOptions: {input: path.resolve(__dirname, 'ubuntu/index.html')}},
})
