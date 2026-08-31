// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { transformerNotationHighlight } from '@shikijs/transformers';

import { remarkImageAssets } from './src/plugins/remark-image-assets.mjs';
import { shikiMetaTransformer } from './src/plugins/shiki-meta-transformer.mjs';

const PKG = '@laurenfrost/astro-tufte';
const VIRTUAL_ID = 'virtual:astro-tufte/config';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

/** @typedef {{ href: string, label: string }} NavItem */
/** @typedef {{ name: string, url: string, description?: string }} LinkItem */

/** Site data surfaced to theme components through `virtual:astro-tufte/config`. */
const DEFAULT_SITE = {
  title: 'Tufte Style Blog',
  tagline: '',
  description: '',
  lang: 'zh-CN',
  /** Locale used for `toLocaleDateString` in listings. */
  locale: 'zh-CN',
  favicon: '/favicon.svg',
  /** @type {NavItem[]} */
  nav: [
    { href: '/', label: 'HOME' },
    { href: '/archive', label: 'ARCHIVE' },
    { href: '/links', label: 'FRIENDS' },
    { href: '/about', label: 'ABOUT' },
  ],
  footer: {
    /** Show the "built with Astro / inspired by Tufte CSS" line. */
    credit: true,
    /** Defaults to `© <year> <title>.` when empty. */
    copyright: '',
  },
  home: {
    /**
     * Paragraphs rendered above the post list.
     * @type {string[]}
     */
    intro: [],
  },
  /** @type {LinkItem[]} */
  links: [],
  /** UI strings; `{count}` is substituted where noted. */
  text: {
    recentPosts: 'Recent Posts',
    archiveTitle: '归档',
    archiveCount: '共 {count} 篇文章',
    linksTitle: '友链',
    linksIntro: '',
    contents: 'Contents',
  },
  katexCss: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg']);

const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

/** Deep-merge plain objects; arrays are replaced, not concatenated. */
function merge(base, override) {
  if (!override) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = out[key];
    const mergeable =
      value && typeof value === 'object' && !Array.isArray(value) &&
      current && typeof current === 'object' && !Array.isArray(current);
    out[key] = mergeable ? merge(current, value) : value;
  }
  return out;
}

/** Serves `content/posts/<slug>/<image>` from disk during `astro dev`. */
function serveContentImagesPlugin(contentDir) {
  const root = path.resolve(contentDir);

  return {
    name: 'astro-tufte:serve-content-images',
    configureServer(/** @type {any} */ server) {
      server.middlewares.use((/** @type {any} */ req, /** @type {any} */ res, /** @type {any} */ next) => {
        const url = req.url?.split('?')[0];
        if (!url) return next();

        const ext = path.extname(url).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext)) return next();

        // URL pattern: /posts/<post-dir>/<filename>
        const segments = url.split('/').filter(Boolean);
        if (segments.length !== 3 || segments[0] !== 'posts') return next();

        const [, postDir, filename] = segments;
        const filePath = path.resolve(root, postDir, filename);
        if (!filePath.startsWith(root + path.sep)) return next();
        if (!fs.existsSync(filePath)) return next();

        res.setHeader(
          'Content-Type',
          MIME_TYPES[/** @type {keyof typeof MIME_TYPES} */ (ext)] || 'application/octet-stream'
        );
        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
}

/** Exposes the resolved site config to theme components as a virtual module. */
function virtualConfigPlugin(site) {
  return {
    name: 'astro-tufte:virtual-config',
    resolveId(/** @type {string} */ source) {
      return source === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : null;
    },
    load(/** @type {string} */ id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;
      return `export const site = ${JSON.stringify(site)};\nexport default site;\n`;
    },
  };
}

/**
 * @typedef {object} TufteOptions
 * @property {Partial<typeof DEFAULT_SITE>} [site] Site identity, navigation, footer, friend links.
 * @property {object} [images]
 * @property {string} [images.baseUrl] CDN origin used for post images in production builds.
 * @property {string} [images.transformOptions] Cloudflare URL transform opts, e.g. `format=auto,quality=80`.
 * @property {string} [images.contentDir] Where post directories live. Default `./content/posts`.
 * @property {string} [css] Tailwind entry stylesheet, relative to the project root.
 * @property {object} [routes] Toggle individual injected routes off to provide your own.
 * @property {boolean} [routes.home]
 * @property {boolean} [routes.archive]
 * @property {boolean} [routes.links]
 * @property {boolean} [routes.post]
 * @property {boolean} [mdx] Set false if you register `@astrojs/mdx` yourself.
 * @property {boolean} [tailwind] Set false if you register `@tailwindcss/vite` yourself.
 */

/**
 * Tufte theme integration.
 * @param {TufteOptions} [options]
 * @returns {import('astro').AstroIntegration}
 */
export default function tufte(options = {}) {
  const site = merge(DEFAULT_SITE, options.site);
  const {
    images = {},
    css = './src/styles/site.css',
    routes = {},
    mdx: withMdx = true,
    tailwind: withTailwind = true,
  } = options;

  const enabled = { home: true, archive: true, links: true, post: true, ...routes };

  return {
    name: PKG,
    hooks: {
      'astro:config:setup': ({ command, config, injectRoute, injectScript, updateConfig, logger }) => {
        const isDev = command === 'dev';
        const root = fileURLToPath(config.root);
        const contentDir = path.resolve(root, images.contentDir ?? './content/posts');
        const cssPath = path.resolve(root, css);

        if (fs.existsSync(cssPath)) {
          // Same mechanism the old @astrojs/tailwind integration used for global CSS.
          injectScript('page-ssr', `import ${JSON.stringify(cssPath)};`);
        } else {
          logger.warn(
            `Stylesheet not found: ${cssPath}\n` +
              `Create it (or pass the \`css\` option) with at least:\n` +
              `  @import "tailwindcss";\n  @import "${PKG}/theme.css";`
          );
        }

        if (enabled.home) injectRoute({ pattern: '/', entrypoint: `${PKG}/pages/index.astro` });
        if (enabled.archive) injectRoute({ pattern: '/archive', entrypoint: `${PKG}/pages/archive.astro` });
        if (enabled.links) injectRoute({ pattern: '/links', entrypoint: `${PKG}/pages/links.astro` });
        if (enabled.post) injectRoute({ pattern: '/posts/[...slug]', entrypoint: `${PKG}/pages/posts/[...slug].astro` });

        updateConfig({
          integrations: withMdx ? [mdx()] : [],
          vite: {
            plugins: [
              ...(withTailwind ? [tailwindcss()] : []),
              virtualConfigPlugin(site),
              ...(isDev ? [serveContentImagesPlugin(contentDir)] : []),
            ],
            ssr: {
              // Vite externalises node_modules for SSR, which would leave the
              // theme's .astro files uncompiled. Force them through the pipeline.
              noExternal: [PKG],
            },
          },
          markdown: {
            remarkPlugins: [
              remarkMath,
              [
                remarkImageAssets,
                {
                  baseUrl: images.baseUrl,
                  mode: isDev ? 'dev' : 'build',
                  ...(images.transformOptions && { transformOptions: images.transformOptions }),
                },
              ],
            ],
            rehypePlugins: [rehypeKatex],
            shikiConfig: {
              theme: 'github-light',
              wrap: false,
              transformers: [transformerNotationHighlight(), shikiMetaTransformer()],
            },
          },
        });
      },
    },
  };
}
