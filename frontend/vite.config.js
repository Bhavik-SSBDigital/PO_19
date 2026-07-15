import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      components: path.resolve(__dirname, 'src/components'),
      layout: path.resolve(__dirname, 'src/layout'),
      pages: path.resolve(__dirname, 'src/pages'),
      'menu-items': path.resolve(__dirname, 'src/menu-items'),
      assets: path.resolve(__dirname, 'src/assets'),
      routes: path.resolve(__dirname, 'src/routes'),
      store: path.resolve(__dirname, 'src/store'),
      themes: path.resolve(__dirname, 'src/themes'),
      utils: path.resolve(__dirname, 'src/utils'),
      config: path.resolve(__dirname, 'src/config.js'),
    },
  },
  server: {
    port: 3000,
  },
});
