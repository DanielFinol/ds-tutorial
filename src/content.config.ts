import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const lessons = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/lessons' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    module: z.string(),
    order: z.number(),
    minutes: z.number(),
    tools: z.array(z.string()),
    status: z.enum(['ready', 'draft']).default('ready'),
  }),
});

export const collections = { lessons };
