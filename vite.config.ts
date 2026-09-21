import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { main: 'index.html', archive: 'archive-render.html' } } },
  server: {
    // Overridable so a second checkout can run beside the default dev stack.
    port: Number(process.env.STAGE_PORT) || 5178,
    strictPort: true,
    // On Windows, formatter writes can briefly expose an empty file to the watcher.
    // Wait for a completed write before caching/transmitting a transformed module.
    watch: { awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 25 } },
    proxy: { '/api': process.env.STAGE_API || 'http://127.0.0.1:4310' },
  },
});
