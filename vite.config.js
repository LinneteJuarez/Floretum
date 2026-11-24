import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
