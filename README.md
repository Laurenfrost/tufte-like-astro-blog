# @laurenfrost/astro-tufte

Tufte 风格的 Astro 主题：边注（sidenote）、旁注（margin note）、中西文混排优化的字体栈、Cloudflare R2 图床流水线。

以 **Astro integration** 的形式分发——你的博客仓库只放内容和站点配置，样式和页面逻辑全部来自这个包。

## 安装

主题不需要发布到 npm，直接用 git 依赖：

```bash
npm i astro @astrojs/cloudflare tailwindcss
npm i github:Laurenfrost/tufte-like-astro-blog#v0.3.0
```

## 使用

消费者项目需要三个文件。

**`astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tufte from '@laurenfrost/astro-tufte';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    tufte({
      site: {
        title: '我的博客',
        tagline: '副标题',
        nav: [{ href: '/', label: 'HOME' }, { href: '/about', label: 'ABOUT' }],
        links: [{ name: '友链', url: 'https://example.com' }],
      },
      images: { baseUrl: process.env.IMAGE_BASE_URL },
    }),
  ],
});
```

**`src/styles/site.css`** —— Tailwind 入口，由 integration 自动注入到每个页面：

```css
@import "tailwindcss";
@import "@laurenfrost/astro-tufte/theme.css";
```

**`src/content.config.ts`** —— Astro 5 只认这个固定位置，integration 注入不了：

```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { postSchema, generatePostId } from '@laurenfrost/astro-tufte/schema';

export const collections = {
  posts: defineCollection({
    loader: glob({ pattern: '**/index.mdx', base: './content/posts', generateId: generatePostId }),
    schema: postSchema,
  }),
};
```

然后把文章写在 `content/posts/<slug>/index.mdx`，图片与文章同目录。

## 主题提供什么

**注入的路由**（每个都可以在 `routes` 里关掉，然后用自己的同名页面替代）：

| 路由 | 内容 |
|------|------|
| `/` | 站点介绍（`site.home.intro`）+ 文章列表 |
| `/archive` | 按年份分组的归档 |
| `/links` | 友链（`site.links`） |
| `/posts/[...slug]` | 文章页 |

`/about` 一律由你自己写——它本来就是个人内容：

```astro
---
import BaseLayout from '@laurenfrost/astro-tufte/layouts/BaseLayout.astro';
---
<BaseLayout title="关于" wide>…</BaseLayout>
```

**MDX 组件**，在文章里按需引入：

```mdx
import Sidenote from '@laurenfrost/astro-tufte/components/Sidenote.astro';
import Figure from '@laurenfrost/astro-tufte/components/Figure.astro';
```

`Sidenote` `MarginNote` `Figure` `MarginFigure` `Blockquote` `Cite` `Fullwidth` `Ruby`
`TableOfContents`。

文章 frontmatter 里写 `toc: true` 就会在正文上方渲染一个可折叠的目录（h2–h3），
不需要自己引入 `TableOfContents`。

**自动配置的 Markdown 流水线**：MDX、KaTeX（`math: true` 时才加载 CSS）、Shiki + 自定义 meta string
（` ```go {wrap=true,lineno=true,hl_lines=["2-5"],linenostart=199} `）、图片路径改写。

## Integration 选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `site` | 见下 | 站点标题、导航、页脚、友链、首页引言、UI 文案 |
| `images.baseUrl` | `https://img.example.com` | 构建时图片 CDN 源 |
| `images.transformOptions` | — | 模式 B，如 `format=auto,quality=80` |
| `images.contentDir` | `./content/posts` | 文章目录（dev 图片中间件用） |
| `css` | `./src/styles/site.css` | Tailwind 入口样式表 |
| `routes` | 全部 `true` | `home` / `archive` / `links` / `post` 开关 |
| `mdx` / `tailwind` | `true` | 关掉后自己注册 `@astrojs/mdx` / `@tailwindcss/vite` |

`site` 的完整字段见 [`integration.mjs`](./integration.mjs) 里的 `DEFAULT_SITE`，也可以在组件里通过
`import { site } from 'virtual:astro-tufte/config'` 读到。

## 图片流水线

```
content/posts/<slug>/hero.jpg
  ├─ dev   → Vite 中间件从本地目录读取  /posts/<slug>/hero.jpg
  └─ build → ${baseUrl}/posts/<slug>/hero.jpg
                  ↑ rclone sync 到 R2，由 worker/ 里的 Worker 代理 + Images Binding 转格式
```

MDX 里始终写相对路径 `![alt](./hero.jpg)`，remark 插件负责改写。图片同步到 R2：

```bash
rclone sync content/posts r2:<bucket>/posts --include "*.{jpg,jpeg,png,gif,webp,avif,svg}" --config rclone.conf
```

### 图床 Worker

`worker/src/index.ts` 从 R2 取图，按 `Accept` 头选 AVIF / WebP / 原格式，走 Images Binding
转换并用 Cache API 缓存。**源码只有这一份**——消费者不要复制，只在自己仓库里放一份部署配置，
把 `main` 指向 node_modules 里的源码：

```jsonc
// <blog>/worker/wrangler.jsonc
{
  "main": "../node_modules/@laurenfrost/astro-tufte/worker/src/index.ts",
  "name": "my-blog-image",
  "compatibility_date": "2024-01-01",
  "r2_buckets": [{ "binding": "R2_BUCKET", "bucket_name": "my-bucket" }],
  "images": { "binding": "IMAGES" }
}
```

```bash
wrangler deploy --config worker/wrangler.jsonc
```

把部署后的 `https://<name>.<subdomain>.workers.dev` 填进站点的 `IMAGE_BASE_URL` 即可。

R2 bucket 绑上自定义域名之后，这个 Worker 就可以整个不要了：设
`IMAGE_TRANSFORM_OPTIONS=format=auto,quality=80`，主题会改写成 `/cdn-cgi/image/` 的 URL，
由 Cloudflare 边缘直接变换（模式 B）。

## 本仓库的开发

`playground/` 是一个完整的示例站点，通过 `file:..` 引用本目录的主题，用来开发和验证改动：

```bash
npm install     # 安装主题依赖 + playground（npm workspace）
npm run dev     # 起 playground
npm run build
```

改主题源码后 playground 会热更新。

CI（`.github/workflows/ci.yaml`）在 push 和 PR 上构建 playground——它是本仓库里唯一的消费者，
组件、路由、`exports` map 出问题都会在这里露出来。master 上如果配了 `CLOUDFLARE_API_TOKEN`
和 `CLOUDFLARE_ACCOUNT_ID`，还会把 playground 部署成 demo 站；没配就只跑构建，不会失败。
仓库变量 `IMAGE_BASE_URL` 指向 playground 自己的图床 Worker。

```
/
├── integration.mjs        # Astro integration 入口（路由注入、Markdown 配置、虚拟配置模块）
├── src/
│   ├── components/        # MDX / 布局组件
│   ├── layouts/           # BaseLayout（Tufte 栅格）
│   ├── pages/             # 被注入的路由
│   ├── plugins/           # remark 图片改写、Shiki meta string 解析
│   ├── schema.mjs         # 文章 frontmatter schema
│   ├── styles/            # fonts.css（@font-face）/ theme.css（Tailwind 层）
│   └── fonts/             # ET Book + EB Garamond + 霞鹜，由 Vite 打包
├── worker/                # R2 图床代理 Worker
└── playground/            # 示例站点
```

字体走 Vite 资源打包（`src/styles/fonts.css` 里的相对 `url()`），消费者不需要往 `public/` 里放任何字体文件。

拉丁字体整体转成 WOFF2；三个霞鹜 CJK 字体按 unicode-range 切成小片，页面只下载它实际渲染到的
那几片（单片平均 30KB），而不是无条件拉整个字体——LXGWWenKai 原来是 24MB 的 TTF。
`src/fonts/Lxgw/*/index.css` 是生成产物，不要手改；原始 TTF 不入库，要重新生成用
`./tools/build-fonts.sh <放原始 ttf 的目录>`。

## License

MIT
