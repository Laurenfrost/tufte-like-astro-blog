// @ts-check
import { z } from 'astro/zod';

/**
 * Frontmatter schema for the `posts` collection.
 *
 * Extend it in your own `src/content.config.ts`:
 *   schema: postSchema.extend({ series: z.string().optional() })
 */
export const postSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  date: z.coerce.date(),
  draft: z.boolean().default(false),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
  math: z.boolean().default(false),
});

/** Strips the trailing `/index.mdx` so a post's id is its directory name. */
export const generatePostId = (/** @type {{ entry: string }} */ { entry }) =>
  entry.replace(/\/index\.mdx$/, '');

export default postSchema;
