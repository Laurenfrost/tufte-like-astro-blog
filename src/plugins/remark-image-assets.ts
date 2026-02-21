import { visit } from 'unist-util-visit';
import type { Root, Image } from 'mdast';

interface RemarkImageAssetsOptions {
  baseUrl?: string;
}

const defaultOptions: RemarkImageAssetsOptions = {
  baseUrl: 'https://img.example.com',
};

export function remarkImageAssets(options: RemarkImageAssetsOptions = {}) {
  const { baseUrl } = { ...defaultOptions, ...options };

  return (tree: Root) => {
    visit(tree, 'image', (node: Image) => {
      const src = node.url;

      // Transform ./assets/filename.ext or assets/filename.ext
      if (src.startsWith('./assets/') || src.startsWith('assets/')) {
        const filename = src.replace(/^\.?\/assets\//, '');
        node.url = `${baseUrl}/${filename}`;
      }
    });
  };
}

export default remarkImageAssets;
