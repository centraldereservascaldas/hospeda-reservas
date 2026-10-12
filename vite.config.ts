import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000',
      '/external/v1': process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000',
    },
  },
});
