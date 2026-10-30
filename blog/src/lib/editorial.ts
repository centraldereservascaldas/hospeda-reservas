import { getCollection, type CollectionEntry } from 'astro:content';

export const categories = {
  planejamento: {
    label: 'Planeje sua viagem',
    description: 'Localização, orçamento e decisões que fazem diferença antes de reservar.',
  },
  familia: {
    label: 'Em boa companhia',
    description: 'Ideias para escolher uma estadia com crianças, família e pets.',
  },
  experiencias: {
    label: 'Dias de descanso',
    description: 'Piscinas, passeios e escolhas para aproveitar a região no seu ritmo.',
  },
} as const;
export const PAGE_SIZE = 6;
export type Post = CollectionEntry<'posts'>;

export async function publishedPosts(): Promise<Post[]> {
  const now = new Date();
  const posts = await getCollection('posts', ({ data }) => !data.draft && data.publishedAt <= now);
  for (const post of posts) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.id))
      throw new Error(`Invalid article slug: ${post.id}`);
  }
  return posts.sort(
    (a, b) =>
      b.data.publishedAt.getTime() - a.data.publishedAt.getTime() || a.id.localeCompare(b.id),
  );
}

export function accommodationLink(intent: Post['data']['intent']): string {
  const filters: Partial<Record<Post['data']['intent'], string>> = {
    familia: 'family_friendly',
    pets: 'pet_friendly',
    piscinas: 'pools_24h',
    centro: 'near_center',
  };
  const query = new URLSearchParams({ destination: 'Caldas Novas' });
  if (filters[intent]) query.set('category', filters[intent]);
  return `/?${query.toString()}#stays-apartments-catalog`;
}

export function readingMinutes(post: Post): number {
  return Math.max(1, Math.ceil((post.body || '').split(/\s+/).length / 200));
}

export function displayDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export function listingRoutes(posts: Post[]): string[] {
  const routes = ['/blog/'];
  for (let page = 2; page <= Math.ceil(posts.length / PAGE_SIZE); page++)
    routes.push(`/blog/pagina/${page}/`);
  for (const category of Object.keys(categories)) {
    const count = posts.filter((post) => post.data.category === category).length;
    if (!count) continue;
    routes.push(`/blog/categoria/${category}/`);
    for (let page = 2; page <= Math.ceil(count / PAGE_SIZE); page++)
      routes.push(`/blog/categoria/${category}/pagina/${page}/`);
  }
  return routes;
}
