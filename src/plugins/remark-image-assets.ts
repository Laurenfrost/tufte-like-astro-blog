import { visit } from 'unist-util-visit';
import type { Root, Image } from 'mdast';
import type { VFile } from 'vfile';
import path from 'node:path';

interface RemarkImageAssetsOptions {
  baseUrl?: string;
  mode?: 'dev' | 'build';
  /** Image transformation options for Mode B (URL-based, e.g. "format=auto,quality=80").
   *  When set, build URLs use /cdn-cgi/image/{options}/ prefix. */
  transformOptions?: string;
}

const defaultOptions: RemarkImageAssetsOptions = {
  baseUrl: 'https://img.example.com',
  mode: 'build',
};

/**
 * Remark plugin that transforms relative image paths in MDX files.
 * Handles both markdown images and JSX component src props (e.g. Figure, MarginFigure).
 *
 * - Dev mode:  `./hero.jpg` → `/posts/<post-dir>/hero.jpg` (served by Vite middleware)
 * - Build mode: `./hero.jpg` → `https://img.example.com/posts/<post-dir>/hero.jpg`
 */
export function remarkImageAssets(options: RemarkImageAssetsOptions = {}) {
  const { baseUrl, mode, transformOptions } = { ...defaultOptions, ...options };

  return (tree: Root, file: VFile) => {
    // Extract post directory name from file path
    // e.g. /project/content/posts/hello-world/index.mdx → hello-world
    const filePath = file.path || file.history?.[0] || '';
    const postDir = extractPostDir(filePath);

    if (!postDir) return;

    const buildUrl = (filename: string): string => {
      const imagePath = `posts/${postDir}/${filename}`;
      if (mode === 'dev') return `/${imagePath}`;
      // Mode B: insert /cdn-cgi/image/{options}/ when transformOptions is set
      if (transformOptions) return `${baseUrl}/cdn-cgi/image/${transformOptions}/${imagePath}`;
      return `${baseUrl}/${imagePath}`;
    };

    const transformSrc = (src: string): string => {
      // Only transform relative paths starting with ./ or bare filenames
      if (src.startsWith('./')) return buildUrl(src.slice(2));
      // Also handle bare relative filenames (e.g. "image-4.png" without ./)
      if (!src.startsWith('/') && !src.startsWith('http') && !src.startsWith('data:')) return buildUrl(src);
      return src;
    };

    // Transform markdown images: ![alt](./image.png)
    visit(tree, 'image', (node: Image) => {
      node.url = transformSrc(node.url);
    });

    // Transform JSX component src props: <Figure src="./image.png" />
    visit(tree, ['mdxJsxFlowElement', 'mdxJsxTextElement'], (node: any) => {
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

function extractPostDir(filePath: string): string | null {
  // Match content/posts/<post-dir>/index.mdx
  const match = filePath.match(/content\/posts\/([^/]+)\/index\.mdx$/);
  if (match) return match[1];

  // Fallback: take parent directory name
  const dir = path.basename(path.dirname(filePath));
  return dir && dir !== '.' ? dir : null;
}

export default remarkImageAssets;