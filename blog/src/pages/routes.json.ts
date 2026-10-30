import { publishedPosts, listingRoutes } from '../lib/editorial';
export async function GET(): Promise<Response> {
  const posts = await publishedPosts();
  return Response.json([...listingRoutes(posts), ...posts.map((post) => `/blog/${post.id}/`)]);
}
