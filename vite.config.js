import { defineConfig } from 'vite'

export default defineConfig({
  assetsInclude: ['**/*.glsl'],
  build: {
    target: 'es2020',
  },
})
