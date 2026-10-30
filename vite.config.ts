import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const backendTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': backendTarget,
      '/external/v1': backendTarget,
      '/destinos': backendTarget,
      '/condominios': backendTarget,
      '/guias': backendTarget,
      '/sitemap.xml': backendTarget,
      '/robots.txt': backendTarget,
      '/blog': process.env.VITE_BLOG_PROXY_TARGET || 'http://127.0.0.1:4321',
    },
  },
});
