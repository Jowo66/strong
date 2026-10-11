/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://jowo66.github.io/strong/ so every asset URL must live under /strong/.
export default defineConfig({
  base: '/strong/',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173 },
  build: { chunkSizeWarningLimit: 1600 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
