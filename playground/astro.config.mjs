// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { loadEnv } from 'vite';

import tufte from '@laurenfrost/astro-tufte';

const env = loadEnv(process.env.NODE_ENV || 'production', process.cwd(), '');

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),

  integrations: [
    tufte({
      site: {
        title: 'Tufte Style Blog',
        tagline: 'A modern implementation with Astro and Tailwind CSS 探索清晰、优雅的信息呈现方式',
        description: 'A Tufte-style blog with sidenotes',
        lang: 'zh-CN',
        locale: 'zh-CN',
        home: {
          intro: [
            'This blog uses the design principles of Edward Tufte, the statistician and artist who developed the style of presenting data in his classic books. The style emphasizes the use of sidenotes, a wide main column, and careful attention to typography.',
            '这种设计同样适用于中文排版。通过合理的行高设置和字体选择，中西文混排可以达到和谐统一的视觉效果。',
            'さらに日本語も同様に、適切な行間とフォント選択を行うことで、違う言語の混在が美しく調和するデザインを実現できます。',
          ],
        },
        text: {
          linksIntro: '这里是一些我喜欢的网站和朋友们的博客。',
        },
        links: [
          {
            name: '示例友链',
            url: 'https://example.com',
            description: '这是一个示例友链的描述文字',
          },
        ],
      },
      images: {
        // Mode A (Worker binding): just the origin.
        baseUrl: env.IMAGE_BASE_URL || 'https://img.example.com',
        // Mode B (custom domain): e.g. "format=auto,quality=80"
        transformOptions: env.IMAGE_TRANSFORM_OPTIONS || undefined,
      },
    }),
  ],
});
