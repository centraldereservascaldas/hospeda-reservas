import { publishedPosts, listingRoutes } from '../lib/editorial';
import type { APIContext } from 'astro';
export async function GET({ site }: APIContext): Promise<Response> {
  const posts = await publishedPosts();
  const pages = [
    ...listingRoutes(posts).map((path) => ({ path, date: undefined })),
    ...posts.map((post) => ({
      path: `/blog/${post.id}/`,
      date: (post.data.updatedAt || post.data.publishedAt).toISOString(),
    })),
  ];
  const urls = pages
    .map(
      (page) =>
        `<url><loc>${new URL(page.path, site).href.replace(/&/g, '&amp;')}</loc>${page.date ? `<lastmod>${page.date}</lastmod>` : ''}</url>`,
    )
    .join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
}
