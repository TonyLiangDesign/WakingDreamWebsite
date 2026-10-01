import { defineConfig } from 'vite';

export default defineConfig({
  base: '/titanic/southampton/',
  build: { outDir: '../../titanic/southampton', emptyOutDir: true, rollupOptions: { output: { manualChunks: (id) => id.includes('node_modules') ? 'vendor' : undefined } } },
  // The shared ship sources now live inside this project and use one Three.js instance.
  resolve: { dedupe: ['three'] },
  server: { port: 5190, hmr: { overlay: false } },
});
