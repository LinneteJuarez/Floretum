import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
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
    outDir: 'dist/client',
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
});
