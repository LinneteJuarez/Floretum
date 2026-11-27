import { cpSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const publicDirectory = fileURLToPath(new URL('./public', import.meta.url));
const pagesAssetLimit = 25 * 1024 * 1024;

export default defineConfig(({ mode }) => {
  const pages = mode === 'pages';
  const scanBaseUrl = loadEnv(mode, process.cwd()).VITE_SCAN_BASE_URL
    || 'https://pub-3f7a9fbf14b84bf0badad434cb019824.r2.dev';

  return {
    plugins: [
      react(),
      ...(pages ? [{
        name: 'pages-public-assets',
        apply: 'build',
        writeBundle({ dir }) {
          cpSync(publicDirectory, dir, {
            recursive: true,
            filter(source) {
              const entry = statSync(source);
              return entry.isDirectory() || entry.size <= pagesAssetLimit;
            },
          });
        },
      }] : []),
    ],
    define: {
      'import.meta.env.VITE_SCAN_BASE_URL': JSON.stringify(pages ? scanBaseUrl : ''),
    },
    server: {
      port: 3002,
      strictPort: true,
      proxy: {
        '/api/n8n': {
          target: 'http://127.0.0.1:5678',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/n8n/, ''),
        },
      },
    },
    base: './',
    build: {
      copyPublicDir: !pages,
      outDir: pages ? 'dist/pages' : 'dist/client',
      emptyOutDir: true,
      assetsInlineLimit: 0,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'react', test: /node_modules[\\/]react(?:-dom)?[\\/]/ },
              { name: 'splat-viewer', test: /node_modules[\\/](@mkkellogg|three)[\\/]/ },
            ],
          },
        },
      },
    },
  };
});
