import { defineConfig } from 'vite';

export default defineConfig({
  base: '/boat-configurator/',
  build: { outDir: '../../boat-configurator', emptyOutDir: true, rollupOptions: { output: { manualChunks: (id) => id.includes('node_modules') ? 'vendor' : undefined } } },
  server: { port: 5191 },
});
