/// <reference types="vitest" />
/// <reference types="node" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
let commit = 'dev';
try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a git checkout */ }

// Served from https://jowo66.github.io/strong/ so every asset URL must live under /strong/.
export default defineConfig({
  base: '/strong/',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_COMMIT__: JSON.stringify(commit) },
  server: { host: '127.0.0.1', port: 5173 },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // libraries change rarely: separate files stay in the browser cache across Mini Gym updates
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(three|three-stdlib)\//.test(id)) return 'three';
          if (/node_modules\/(@react-three|postprocessing|n8ao|maath|troika|camera-controls|meshline|stats)/.test(id)) return 'r3f';
          if (/node_modules\/(react|react-dom|scheduler|zustand|use-sync-external-store|its-fine|react-reconciler|suspend-react)\//.test(id)) return 'react';
          return 'vendor';
        },
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
