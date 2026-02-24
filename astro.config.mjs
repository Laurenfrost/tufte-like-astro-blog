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
import fs from 'node:fs';
import path from 'node:path';

// Image CDN base URL - configure for your R2 bucket
const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL || 'https://img.example.com';
const isDev = process.argv.includes('dev');

/** Vite plugin: serve images from content/posts/<dir>/ during dev */
function serveContentImagesPlugin() {
  const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg']);

  return {
    name: 'serve-content-images',
    configureServer(/** @type {any} */ server) {
      server.middlewares.use((/** @type {any} */ req, /** @type {any} */ res, /** @type {any} */ next) => {
        const url = req.url?.split('?')[0];
        if (!url) return next();

        const ext = path.extname(url).toLowerCase();
        if (!imageExtensions.has(ext)) return next();

        // URL pattern: /<post-dir>/<filename>
        const segments = url.split('/').filter(Boolean);
        if (segments.length !== 2) return next();

        const [postDir, filename] = segments;
        const filePath = path.resolve('content/posts', postDir, filename);

        if (!fs.existsSync(filePath)) return next();

        const mimeTypes = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.avif': 'image/avif',
          '.svg': 'image/svg+xml',
        };

        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
}

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),

  vite: {
    plugins: [
      tailwindcss(),
      isDev && serveContentImagesPlugin(),
    ].filter(Boolean),
  },

  markdown: {
    remarkPlugins: [
      remarkMath,
      [remarkImageAssets, { baseUrl: IMAGE_BASE_URL, mode: isDev ? 'dev' : 'build' }],
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
