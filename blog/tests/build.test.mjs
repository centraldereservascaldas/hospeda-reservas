import assert from 'node:assert/strict';
import { readFile, mkdtemp, cp, symlink, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'public/blog');
const origin = new URL(process.env.BLOG_SITE_URL || 'https://centraldereservascaldas.com').origin;
const read = (directory, route) =>
  readFile(path.join(directory, route.replace(/^\/blog\//, ''), 'index.html'), 'utf8');
const documentFor = (html) => new JSDOM(html).window.document;
const manifest = JSON.parse(await readFile(path.join(output, 'routes.json'), 'utf8'));

test('every published route has canonical, accessible landmarks and crawlable accommodation links', async () => {
  assert.ok(manifest.length >= 10);
  assert.equal(new Set(manifest).size, manifest.length);
  for (const route of manifest) {
    const html = await read(output, route);
    const document = documentFor(html);
    assert.equal(document.documentElement.lang, 'pt-BR', route);
    assert.equal(document.querySelectorAll('h1').length, 1, route);
    assert.ok(document.querySelector('main#conteudo'), route);
    assert.equal(document.querySelector('link[rel=canonical]').href, `${origin}${route}`);
    assert.ok(document.querySelector('meta[name=description]').content.length > 40);
    assert.equal(
      document.querySelectorAll('script[src], astro-island').length,
      0,
      'Blog needs no client JavaScript',
    );
    const cta = document.querySelector('a[data-accommodation-cta]');
    assert.ok(cta, route);
    assert.ok(cta.getAttribute('href').endsWith('#stays-apartments-catalog'));
    const schema = JSON.parse(
      document.querySelector('script[type="application/ld+json"]').textContent,
    );
    assert.equal(schema['@context'], 'https://schema.org');
    for (const link of document.querySelectorAll('a[href^="/blog/"]')) {
      const linked = link.getAttribute('href').split('#')[0];
      assert.ok(manifest.includes(linked), `${route} has broken blog link ${linked}`);
    }
    for (const link of document.querySelectorAll('a[href^="#"]')) {
      assert.ok(
        document.getElementById(link.getAttribute('href').slice(1)),
        'Local anchor must exist',
      );
    }
  }
});

test('article HTML includes the full body, byline, dates, related posts and intent filters', async () => {
  const cases = {
    'caldas-novas-com-criancas': 'family_friendly',
    'hospedagem-pet-friendly-caldas-novas': 'pet_friendly',
    'piscinas-caldas-novas-hospedagem': 'pools_24h',
  };
  for (const [slug, filter] of Object.entries(cases)) {
    const document = documentFor(await read(output, `/blog/${slug}/`));
    assert.ok(document.querySelector('article .prose').textContent.split(/\s+/).length >= 400);
    assert.ok(document.querySelector('.byline').textContent.includes('Equipe CRCN'));
    assert.ok(document.querySelector('time[datetime]'));
    assert.equal(document.querySelectorAll('.related .post-card').length, 3);
    const href = document.querySelector('a[data-accommodation-cta]').getAttribute('href');
    assert.equal(new URL(href, origin).searchParams.get('category'), filter);
    const schema = JSON.parse(
      document.querySelector('script[type="application/ld+json"]').textContent,
    );
    assert.ok(schema['@graph'].some((entry) => entry['@type'] === 'BlogPosting'));
  }
});

test('sitemap and route manifest describe exactly the same public HTML', async () => {
  const xml = await readFile(path.join(output, 'sitemap.xml'), 'utf8');
  const document = new JSDOM(xml, { contentType: 'application/xml' }).window.document;
  assert.deepEqual(
    [...document.querySelectorAll('loc')].map((node) => new URL(node.textContent).pathname).sort(),
    [...manifest].sort(),
  );
  assert.equal(
    document.querySelectorAll('lastmod').length,
    manifest.filter(
      (route) =>
        route !== '/blog/' && !route.includes('/categoria/') && !route.includes('/pagina/'),
    ).length,
  );
});

test(
  'real fixture build excludes drafts/future content and paginates main and category routes',
  { timeout: 120000 },
  async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'crcn-blog-'));
    try {
      await cp(path.join(root, 'blog/src'), path.join(fixture, 'src'), { recursive: true });
      await cp(path.join(root, 'blog/astro.config.mjs'), path.join(fixture, 'astro.config.mjs'));
      await writeFile(path.join(fixture, 'package.json'), '{"type":"module"}');
      await symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
      const article = await readFile(
        path.join(fixture, 'src/content/posts/onde-ficar-em-caldas-novas.md'),
        'utf8',
      );
      const content = path.join(fixture, 'src/content/posts');
      for (let number = 1; number <= 7; number++) {
        await writeFile(
          path.join(content, `teste-publicado-${number}.md`),
          article.replace('featured: true', 'featured: false'),
        );
      }
      await writeFile(
        path.join(content, 'teste-rascunho.md'),
        article.replace('draft: false\n', ''),
      );
      await writeFile(
        path.join(content, 'teste-futuro.md'),
        article.replace('2026-10-29', '2100-01-01'),
      );
      const safeTitle = 'Guia seguro </script><script>alert(1)</script>';
      await writeFile(
        path.join(content, 'teste-seguro.md'),
        article.replace(/title: .*/, `title: '${safeTitle}'`),
      );
      const fixtureOutput = path.join(fixture, 'output');
      const built = spawnSync(
        process.execPath,
        [
          path.join(root, 'node_modules/astro/bin/astro.mjs'),
          'build',
          '--root',
          fixture,
          '--outDir',
          fixtureOutput,
        ],
        {
          cwd: root,
          encoding: 'utf8',
          timeout: 110000,
          env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', BLOG_SITE_URL: origin },
        },
      );
      assert.equal(built.status, 0, built.stdout + built.stderr);
      const routes = JSON.parse(await readFile(path.join(fixtureOutput, 'routes.json'), 'utf8'));
      assert.ok(!routes.some((route) => /teste-(rascunho|futuro)/.test(route)));
      await assert.rejects(access(path.join(fixtureOutput, 'teste-rascunho/index.html')));
      await assert.rejects(access(path.join(fixtureOutput, 'teste-futuro/index.html')));
      assert.ok(routes.includes('/blog/pagina/3/'));
      assert.ok(routes.includes('/blog/categoria/planejamento/pagina/2/'));
      const category = documentFor(
        await read(fixtureOutput, '/blog/categoria/planejamento/pagina/2/'),
      );
      assert.equal(
        category.querySelector('link[rel=canonical]').href,
        `${origin}/blog/categoria/planejamento/pagina/2/`,
      );
      assert.equal(category.querySelector('.pagination [aria-current=page]').textContent, '2');
      for (const link of category.querySelectorAll('.pagination a'))
        assert.ok(link.href.includes('/blog/categoria/planejamento/'));
      const first = documentFor(await read(fixtureOutput, '/blog/'));
      const second = documentFor(await read(fixtureOutput, '/blog/pagina/2/'));
      const firstLinks = [...first.querySelectorAll('.post-card-link')].map((link) => link.href);
      const secondLinks = [...second.querySelectorAll('.post-card-link')].map((link) => link.href);
      assert.equal(firstLinks.length, 6);
      assert.ok(secondLinks.every((link) => !firstLinks.includes(link)));
      const safe = documentFor(await read(fixtureOutput, '/blog/teste-seguro/'));
      assert.equal(safe.querySelectorAll('script').length, 1);
      assert.equal(safe.querySelector('h1').textContent, safeTitle);
      assert.ok(
        JSON.parse(safe.querySelector('script').textContent)['@graph'].some(
          (entry) => entry.headline === safeTitle,
        ),
      );
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  },
);
