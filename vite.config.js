import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Builds the React popup. Everything in /public (manifest.json, background.js,
// content.js, icons) is copied into /dist as-is, producing a complete,
// loadable MV3 extension in /dist.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
      },
    },
    // Chrome extensions load locally — no need to inline assets aggressively
    assetsInlineLimit: 0,
  },
});
