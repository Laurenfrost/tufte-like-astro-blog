// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { remarkImageAssets } from './src/plugins/remark-image-assets';
import {
  transformerNotationHighlight,
  transformerMetaHighlight,
} from '@shikijs/transformers';

// Image CDN base URL - configure for your R2 bucket
const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL || 'https://img.example.com';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),

  vite: {
    plugins: [tailwindcss()],
  },

  markdown: {
    remarkPlugins: [
      remarkMath,
      [remarkImageAssets, { baseUrl: IMAGE_BASE_URL }],
    ],
    rehypePlugins: [
      rehypeKatex,
    ],
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
      transformers: [
        transformerNotationHighlight(),
        transformerMetaHighlight(),
      ],
    },
  },

  integrations: [mdx()],
});