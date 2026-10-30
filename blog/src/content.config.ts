import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z
    .object({
      title: z.string().min(20).max(90),
      description: z.string().min(90).max(180),
      publishedAt: z.coerce.date(),
      updatedAt: z.coerce.date().optional(),
      category: z.enum(['planejamento', 'familia', 'experiencias']),
      intent: z.enum(['geral', 'familia', 'pets', 'piscinas', 'centro']),
      takeaway: z.string().min(50).max(350),
      draft: z.boolean().default(true),
      featured: z.boolean().default(false),
    })
    .refine((post) => !post.updatedAt || post.updatedAt >= post.publishedAt, {
      message: 'updatedAt must not precede publishedAt.',
    }),
});

export const collections = { posts };
