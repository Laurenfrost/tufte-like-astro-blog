import { visit } from 'unist-util-visit';
import type { Root, Image } from 'mdast';
import type { VFile } from 'vfile';
import path from 'node:path';

interface RemarkImageAssetsOptions {
  baseUrl?: string;
  mode?: 'dev' | 'build';
}

const defaultOptions: RemarkImageAssetsOptions = {
  baseUrl: 'https://img.example.com',
  mode: 'build',
};

/**
 * Remark plugin that transforms relative image paths in MDX files.
 *
 * - Dev mode:  `./hero.jpg` → `/<post-dir>/hero.jpg` (served by Vite middleware)
 * - Build mode: `./hero.jpg` → `https://img.example.com/<post-dir>/hero.jpg`
 */
export function remarkImageAssets(options: RemarkImageAssetsOptions = {}) {
  const { baseUrl, mode } = { ...defaultOptions, ...options };

  return (tree: Root, file: VFile) => {
    // Extract post directory name from file path
    // e.g. /project/content/posts/hello-world/index.mdx → hello-world
    const filePath = file.path || file.history?.[0] || '';
    const postDir = extractPostDir(filePath);

    if (!postDir) return;

    visit(tree, 'image', (node: Image) => {
      const src = node.url;

      // Only transform relative paths starting with ./
      if (!src.startsWith('./')) return;

      const filename = src.slice(2); // strip ./

      if (mode === 'dev') {
        node.url = `/${postDir}/${filename}`;
      } else {
        node.url = `${baseUrl}/${postDir}/${filename}`;
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
