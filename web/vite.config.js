import "dotenv/config";
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

const webPort = Number(process.env.WEB_PORT || 5206);
const backendPort = Number(process.env.PORT || 3211);

export default defineConfig({
  plugins: [vue()],
  root: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true
  },
  server: {
    host: '0.0.0.0',
    port: webPort,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: false
      },
      "/ws": {
        target: `ws://127.0.0.1:${backendPort}`,
        changeOrigin: false,
        ws: true
      }
    }
  }
});
