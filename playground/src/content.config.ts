import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { postSchema, generatePostId } from '@laurenfrost/astro-tufte/schema';

const posts = defineCollection({
  loader: glob({
    pattern: '**/index.mdx',
    base: './content/posts',
    generateId: generatePostId,
  }),
  schema: postSchema,
});

export const collections = { posts };
