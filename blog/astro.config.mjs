import { createRequire } from 'node:module';
import { defineConfig } from 'astro/config';

const astroRequire = createRequire(import.meta.resolve('astro/package.json'));

const site = new URL(process.env.BLOG_SITE_URL || 'https://centraldereservascaldas.com');
if (
  !['http:', 'https:'].includes(site.protocol) ||
  site.username ||
  site.password ||
  site.pathname !== '/' ||
  site.search ||
  site.hash
) {
  throw new Error('BLOG_SITE_URL must be a public HTTP(S) origin.');
}

export default defineConfig({
  site: site.origin,
  base: '/blog',
  output: 'static',
  vite: { resolve: { alias: { cookie: astroRequire.resolve('cookie') } } },
  trailingSlash: 'always',
  outDir: '../public/blog',
  build: { format: 'directory' },
  server: { host: '127.0.0.1', port: 4321 },
});
