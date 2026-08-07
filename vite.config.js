import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.glsl', '**/*.vs', '**/*.fs', '**/*.glb', '**/*.gltf', '**/*.hdr', '**/*.ktx2'],
  optimizeDeps: {
    entries: ['index.html', 'src/examples/*/index.jsx'],
    include: ['three', '@react-three/fiber', '@react-three/drei'],
  },
})
