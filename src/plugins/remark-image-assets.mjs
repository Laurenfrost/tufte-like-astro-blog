// @ts-check
import path from 'node:path';
import { visit } from 'unist-util-visit';

/**
 * @typedef {object} RemarkImageAssetsOptions
 * @property {string} [baseUrl] CDN origin used in build mode.
 * @property {'dev' | 'build'} [mode]
 * @property {string} [transformOptions] Image transformation options for Mode B (URL-based,
 *   e.g. `format=auto,quality=80`). When set, build URLs use a `/cdn-cgi/image/{options}/` prefix.
 */

/** @type {RemarkImageAssetsOptions} */
const defaultOptions = {
  baseUrl: 'https://img.example.com',
  mode: 'build',
};

/**
 * Remark plugin that transforms relative image paths in MDX files.
 * Handles both markdown images and JSX component src props (e.g. Figure, MarginFigure).
 *
 * - Dev mode:   `./hero.jpg` → `/posts/<post-dir>/hero.jpg` (served by the dev middleware)
 * - Build mode: `./hero.jpg` → `https://img.example.com/posts/<post-dir>/hero.jpg`
 *
 * @param {RemarkImageAssetsOptions} [options]
 */
export function remarkImageAssets(options = {}) {
  const { baseUrl, mode, transformOptions } = { ...defaultOptions, ...options };

  return (/** @type {any} */ tree, /** @type {any} */ file) => {
    // Post directory name, e.g. /project/content/posts/hello-world/index.mdx → hello-world
    const filePath = file.path || file.history?.[0] || '';
    const postDir = extractPostDir(filePath);

    if (!postDir) return;

    /** @param {string} filename */
    const buildUrl = (filename) => {
      const imagePath = `posts/${postDir}/${filename}`;
      if (mode === 'dev') return `/${imagePath}`;
      // Mode B: insert /cdn-cgi/image/{options}/ when transformOptions is set
      if (transformOptions) return `${baseUrl}/cdn-cgi/image/${transformOptions}/${imagePath}`;
      return `${baseUrl}/${imagePath}`;
    };

    /** @param {string} src */
    const transformSrc = (src) => {
      // Only transform relative paths starting with ./ or bare filenames
      if (src.startsWith('./')) return buildUrl(src.slice(2));
      // Also handle bare relative filenames (e.g. "image-4.png" without ./)
      if (!src.startsWith('/') && !src.startsWith('http') && !src.startsWith('data:')) return buildUrl(src);
      return src;
    };

    // Transform markdown images: ![alt](./image.png)
    visit(tree, 'image', (/** @type {any} */ node) => {
      node.url = transformSrc(node.url);
    });

    // Transform JSX component src props: <Figure src="./image.png" />
    visit(tree, ['mdxJsxFlowElement', 'mdxJsxTextElement'], (/** @type {any} */ node) => {
      const attrs = node.attributes;
      if (!attrs) return;

      for (const attr of attrs) {
        if (attr.type === 'mdxJsxAttribute' && attr.name === 'src' && typeof attr.value === 'string') {
          attr.value = transformSrc(attr.value);
        }
      }
    });
  };
}

/**
 * Posts always live at `<post-dir>/index.mdx`, so the parent directory is the slug.
 * @param {string} filePath
 * @returns {string | null}
 */
function extractPostDir(filePath) {
  if (!filePath) return null;
  const dir = path.basename(path.dirname(filePath));
  return dir && dir !== '.' ? dir : null;
}

export default remarkImageAssets;
