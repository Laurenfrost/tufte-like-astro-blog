# CLAUDE.md - Tufte-Style Astro Blog

## Project Overview

A Tufte-inspired Astro **theme, distributed as an Astro integration** (`@laurenfrost/astro-tufte`).
Core features: sidenotes, margin notes, CJK-aware typography, Cloudflare R2 image hosting.

This repository is the theme package itself and is meant to stay public. The actual blog lives in a
separate **private** repository that consumes this package as a git dependency, so content never
enters this repo. `playground/` is a runnable example site used to develop and verify the theme.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Astro 5.x (SSR mode via `@astrojs/cloudflare`) |
| Deployment | Cloudflare Workers (`wrangler deploy`) |
| Styling | Tailwind CSS 4.x + `@tailwindcss/typography` |
| Typography | ET Book + EB Garamond + 霞鹜字体 (CJK) |
| Content | Astro Content Layer API (MDX, glob loader), 由消费者仓库提供 |
| Image Storage | Cloudflare R2 + Worker proxy |
| Sync | Rclone (local posts to R2) |
| Distribution | npm package / git dependency (Astro integration) |

## Project Structure

```
/                                  # ← npm 包根目录（git 依赖要求 package.json 在仓库根）
├── package.json                   # name/exports/files/peerDeps + workspaces: ["playground"]
├── integration.mjs                # Astro integration 入口
├── virtual.d.ts                   # virtual:astro-tufte/config 的类型声明
├── src/
│   ├── components/                # Sidenote / MarginNote / Figure / MarginFigure /
│   │                              #   Blockquote / Cite / Fullwidth / Ruby / Header / Footer
│   ├── layouts/BaseLayout.astro    # Tufte 栅格 + <head>
│   ├── pages/                     # 被 injectRoute 注入的路由
│   │   ├── index.astro
│   │   ├── archive.astro
│   │   ├── links.astro
│   │   └── posts/[...slug].astro
│   ├── plugins/
│   │   ├── remark-image-assets.mjs    # 图片路径改写（dev/build）
│   │   └── shiki-meta-transformer.mjs # 代码块 meta string 解析
│   ├── schema.mjs                 # postSchema + generatePostId（消费者的 content.config.ts 用）
│   ├── styles/
│   │   ├── fonts.css              # 仅 @font-face，相对 url()，由 BaseLayout 直接 import
│   │   └── theme.css              # @theme / @plugin / 基础样式，由消费者的 Tailwind 入口 import
│   └── fonts/                     # ET Book / EB Garamond / 霞鹜，Vite 打包成 _astro 资源
├── worker/                        # R2 图床代理 Worker（独立部署）
└── playground/                    # 示例站点（file:.. 引用主题）
    ├── astro.config.mjs
    ├── src/content.config.ts
    ├── src/styles/site.css
    ├── src/pages/about.astro
    └── content/posts/<slug>/index.mdx

private-blog/                      # 私有博客仓库的脚手架（.gitignore，待移出）
```

消费者（私有仓库）只需要四样东西：`astro.config.mjs`、`src/content.config.ts`、
`src/styles/site.css`、`content/posts/`。

## Architecture Decisions

### 1. Rendering: SSR on Cloudflare Pages

Using `output: 'server'` with `@astrojs/cloudflare`. This enables:
- Dynamic features if needed in the future
- Edge rendering for optimal global performance
- Direct access to Cloudflare bindings (R2, KV, etc.)

### 2. 分发方式：Astro Integration

主题通过 `integration.mjs` 的 `astro:config:setup` 钩子接管一切：

- `injectRoute` 注入 `/`、`/archive`、`/links`、`/posts/[...slug]`，entrypoint 用包名路径
  （`@laurenfrost/astro-tufte/pages/index.astro`），所以这些文件必须出现在 package.json 的 `exports` 里
- `injectScript('page-ssr', 'import "<consumer>/src/styles/site.css"')` 注入 Tailwind 入口
  （老版 `@astrojs/tailwind` 就是这么做的）
- `updateConfig` 注册 `@astrojs/mdx`、`@tailwindcss/vite`、remark/rehype/Shiki 配置
- 一个 Vite 插件把站点配置暴露成虚拟模块 `virtual:astro-tufte/config`，组件用
  `import { site } from 'virtual:astro-tufte/config'` 读取
- `vite.ssr.noExternal: ['@laurenfrost/astro-tufte']` —— 必须，否则 node_modules 里的 `.astro`
  会被 externalize，SSR 时报 `Unknown file extension '.astro'`

**踩过的坑（改动时注意）：**

| 坑 | 处理 |
|----|------|
| SSR externalize `.astro` | integration 里加 `vite.ssr.noExternal` |
| Tailwind 不扫 node_modules | 主题只用 `prose prose-lg max-w-none` 三个工具类，theme.css 里用 `@source inline(...)` 安全列表；其余样式一律写成普通 CSS / scoped style |
| `src/content.config.ts` 位置固定 | 注入不了，消费者自己写，schema 从 `@laurenfrost/astro-tufte/schema` 导入 |
| config 期执行的代码 | `integration.mjs` 和两个插件都是 `.mjs` + JSDoc，**不要改回 `.ts`**，否则被 externalize 后 Node 直接跑 TS |
| `public/` 注入不了 | 字体改走 `src/fonts/` + fonts.css 里的相对 `url()`，Vite 打包；favicon 归消费者 |

**Content Layer**（消费者侧）：

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

MDX 里通过包路径引用组件（**不是** `@components/` 别名，那个已经废弃）：

```mdx
import Sidenote from '@laurenfrost/astro-tufte/components/Sidenote.astro';
```

Content Layer 使用 `post.id` 而非 `post.slug` 标识文章。

### 3. Image Pipeline

两种图片优化模式，通过配置切换：

#### 模式 A：Worker Binding（当前，无自定义域名）

```
content/posts/<slug>/hero.jpg      ← 图片与文章同目录
         │
         ├─ Dev 模式 ──→ Vite 中间件 ──→ /posts/<slug>/hero.jpg (本地文件)
         │
         └─ Build 模式 ─→ Remark 插件 ──→ https://worker-url/posts/<slug>/hero.jpg
                              │
                              ▼ (rclone sync)
                         R2 Bucket ──→ Worker ──→ Images Binding 变换
                                          │
                                          ├─ Accept: image/avif → AVIF
                                          ├─ Accept: image/webp → WebP
                                          └─ 其他 → 原格式 (quality=80)
                                          │
                                          ▼ (Cache API 缓存)
                                     返回优化后图片
```

- Worker (`worker/src/index.ts`) 使用 Cloudflare Images Binding (`env.IMAGES`) 做格式转换
- 根据 `Accept` header 自动选最优格式：AVIF > WebP > 原格式
- SVG 和 GIF 跳过变换，直接返回原图
- Cache API 缓存，key 包含格式信息（`Vary: Accept`）
- `wrangler.toml` 中 R2 binding 为 `R2_BUCKET`，Images binding 为 `IMAGES`

#### 模式 B：URL 方式（将来有自定义域名时）

```
Build 模式 → Remark 插件 → https://img.domain.com/cdn-cgi/image/format=auto,quality=80/posts/<slug>/hero.jpg
                                    ↓
                           Cloudflare 边缘自动变换 + 缓存
```

- 前提：R2 Bucket 绑定自定义域名 + 启用 Image Transformations
- 不需要 Worker，Cloudflare 边缘自动处理
- 通过环境变量 `IMAGE_TRANSFORM_OPTIONS` 启用（如 `format=auto,quality=80`）
- Remark 插件自动在 URL 中插入 `/cdn-cgi/image/{options}/` 前缀

**切换方式：** 设置环境变量 `IMAGE_TRANSFORM_OPTIONS=format=auto,quality=80` 即可从模式 A 切换到模式 B。

**MDX 中引用图片：**
```mdx
![alt text](./hero.jpg)
```

**Remark 插件** (`src/plugins/remark-image-assets.ts`)：
- 从 `vfile.path` 提取文章目录名（如 `hello-world`）
- Dev 模式：`./hero.jpg` → `/posts/<slug>/hero.jpg`（由 Vite 中间件从本地读取）
- Build 模式（无 transformOptions）：`./hero.jpg` → `${baseUrl}/posts/<slug>/hero.jpg`
- Build 模式（有 transformOptions）：`./hero.jpg` → `${baseUrl}/cdn-cgi/image/${options}/posts/<slug>/hero.jpg`

**Vite 开发中间件** (`astro.config.mjs`)：
- 仅在 Dev 模式下启用
- 拦截 `/posts/<slug>/<image>` 请求（匹配已知图片扩展名：jpg/png/gif/webp/avif/svg）
- 从 `content/posts/<slug>/` 读取文件返回
- 不干扰页面路由

### 4. Tufte Grid System

**核心设计原则：**
- 全宽 = 页面最大宽度 = Header/Footer 宽度 = 正文 + Sidenote
- Header/Footer 在所有页面类型中宽度一致
- 无 Sidenote 时，正文扩展到全宽

**布局结构：**
```
┌─────────────────────────────────────────┐
│           .tufte-container              │  ← 全宽 (max-width)
│  ┌───────────────────────────────────┐  │
│  │            Header                 │  │  ← 填满容器宽度
│  ├───────────────────────────────────┤  │
│  │         .tufte-article            │  │
│  │  ┌─────────────┬─────────────┐    │  │
│  │  │   正文内容   │  Sidenote   │    │  │  ← padding-right 预留空间
│  │  │             │   区域      │    │  │
│  │  └─────────────┴─────────────┘    │  │
│  ├───────────────────────────────────┤  │
│  │            Footer                 │  │  ← 填满容器宽度
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**响应式断点：**
| 屏幕宽度 | 容器 max-width | Article padding-right | 说明 |
|---------|---------------|----------------------|------|
| < 768px | 100% | 0 | 移动端，无 sidenote |
| 768-1023px | 900px | 35% | 平板 |
| 1024-1399px | 1000px | 38% | 桌面 |
| ≥ 1400px | 1100px | 400px | 宽屏 |

**图片宽度模式（`Figure.astro`）：**

| 模式 | 写法 | 宽度 | 适用 |
|------|------|------|------|
| 正文宽 | `<Figure />` | 正文栏（≥1400px 时 600px），说明文字在边注栏 | 一般插图 |
| 全宽 | `<Figure fullwidth />` | 容器内容宽（≥1400px 时 1000px），说明文字居中于图下 | 宽表格、多面板图 |
| 出血 | `<Figure bleed />` | 视口宽（左右各留 2rem），图片最大 1400px | 需要突破容器的大图 |

`fullwidth` 与 `bleed` 都靠「正文内容盒的左边缘 = 容器内容盒的左边缘」来定位：
`margin-left` 保持 0（fullwidth）或按 `(容器内容宽 − 100vw) / 2` 计算（bleed）。
注意容器的 `padding: 0 4%` 是相对**视口**解析的，不是相对它自己的 `max-width`，
所以断点里出现的是 `8vw` / `54vw` 这样的系数。

**Wide 模式：**
- `BaseLayout` 支持 `wide` 属性
- `wide={true}`: 正文扩展到全宽，不保留 sidenote 空间
- 适用于首页、归档、友链、关于等不需要 sidenote 的页面

Mobile: Single column, sidenotes collapse into expandable inline elements (CSS checkbox toggle).

## Coding Standards

### Astro Components

- Use `.astro` for static components, `.tsx` only when client interactivity required
- Props interface at top of component:
  ```astro
  ---
  interface Props {
    label: string;
    numbered?: boolean;
  }
  const { label, numbered = true } = Astro.props;
  ---
  ```
- Minimize client-side JavaScript; prefer CSS-only solutions (e.g., checkbox toggle for mobile sidenotes)

### Tailwind CSS

- **主题组件里不要用 Tailwind 工具类**：Tailwind 默认不扫描 node_modules，包里的工具类
  在消费者项目中会被 purge 掉。用组件的 scoped `<style>` 或 `src/styles/theme.css`。
  唯一的例外是文章正文的 `prose prose-lg max-w-none`，已在 theme.css 里用
  `@source inline(...)` 安全列表兜住。
- 设计 token 定义在 `src/styles/theme.css` 的 `@theme` 块里（Tufte 官方色）：
  ```css
  @theme {
    --color-tufte-bg: #fffff8;   /* Cream paper background */
    --color-tufte-text: #111;    /* Near-black body text */
  }
  ```
- Links: inherit text color, distinguished by underline only (Tufte canonical style)
- 消费者的 Tailwind 入口是自己的 `src/styles/site.css`，由 integration 注入

### Typography & Font Configuration

**字体栈设计：**

| 使用场景 | 西文字体 | CJK 字体 | CSS 变量 |
|---------|---------|---------|----------|
| 正文 | ET Book → EB Garamond | 霞鹜新致宋 | `--font-serif` |
| 斜体 | ET Book Italic → EB Garamond Italic | 霞鹜心致宋 | `--font-serif-italic` |
| 引用 | ET Book → EB Garamond | 霞鹜文楷 | `--font-serif-quote` |

**字体文件结构**（在包内，由 `src/styles/fonts.css` 用相对 `url()` 引用，Vite 打包成 `_astro` 资源；
消费者不需要往自己的 `public/` 放任何字体）：
```
src/fonts/
├── et-book/
│   ├── et-book-roman-old-style-figures/     # 正文 (old-style 数字)
│   ├── et-book-display-italic-old-style-figures/  # 斜体
│   ├── et-book-semi-bold-old-style-figures/ # 半粗体
│   ├── et-book-bold-line-figures/           # 粗体 (line 数字)
│   └── et-book-roman-line-figures/          # 等高数字 (表格用)
├── EB_Garamond/
│   ├── EBGaramond-VariableFont_wght.ttf     # 可变字重
│   └── EBGaramond-Italic-VariableFont_wght.ttf
└── Lxgw/
    ├── LxgwNeoZhiSong/LXGWNeoZhiSong.ttf    # 霞鹜新致宋 (正文)
    ├── LxgwWenKai/LXGWWenKai-Regular.ttf    # 霞鹜文楷 (引用)
    └── LxgwHeartSerif/LXGWHeartSerifCL.ttf  # 霞鹜心致宋 (斜体)
```

**CJK 排版：**
- Line height: 1.6 (CJK 优化)
- Word breaking: `break-word` for mixed CJK/Latin text
- EB Garamond 作为扩展拉丁字符 (如 ṅ, ā, ū) 的 fallback

**引用样式：**

所有引用统一使用 `--font-serif-quote` 字体栈 + 斜体：

| 样式 | 用途 | 特点 |
|------|------|------|
| Markdown `>` | 普通引用 | 斜体，左缩进 2rem |
| `<Blockquote>` | 带出处的引用 | 斜体，左缩进 2rem，支持 author/source/url |
| `<Blockquote epigraph>` | 题记引用 | 斜体，居中，装饰性引号，宽度 70% |
| `<Cite>` | 行内引用 | 斜体，字号/行高继承正文 |

渲染效果：
- 西文：ET Book Display Italic
- CJK：霞鹜文楷（楷体风格）

### Accessibility

- Sidenote references must be focusable with proper `aria-describedby`
- Minimum touch target 44x44px for mobile sidenote toggles
- Maintain sufficient color contrast (WCAG AA minimum)

## Development Commands

```bash
# 主题仓库（本仓库）
npm install            # 安装主题依赖 + playground（npm workspace，file:.. 软链）
npm run dev            # 起 playground，改主题源码即时生效
npm run build
npm run deploy:worker  # 部署 R2 图床 Worker

# 私有博客仓库
npm run dev
npm run deploy         # astro build && wrangler deploy
npm run sync:images    # rclone sync content/posts r2:blog-images
```

发版：主题仓库打 tag（`git tag v0.1.0 && git push --tags`），私有仓库把
`"@laurenfrost/astro-tufte": "github:Laurenfrost/tufte-like-astro-blog#v0.1.0"` 的版本号改掉再 `npm install`。

## Key Files Reference

| File | Purpose |
|------|---------|
| `integration.mjs` | Integration 入口：路由注入、CSS 注入、Markdown/Vite 配置、`DEFAULT_SITE` 站点配置默认值 |
| `package.json` | `exports` map —— 新增任何需要被消费者引用的文件都要在这里登记 |
| `virtual.d.ts` | `virtual:astro-tufte/config` 类型；改 `DEFAULT_SITE` 时同步更新 |
| `src/layouts/BaseLayout.astro` | Tufte 栅格、`<head>`、fonts.css 的唯一入口 |
| `src/styles/theme.css` | 设计 token、基础样式、prose 覆盖（需要 Tailwind 处理） |
| `src/styles/fonts.css` | 纯 @font-face，相对 url()，不含 Tailwind 指令 |
| `src/plugins/remark-image-assets.mjs` | 图片路径改写（dev：本地中间件；build：CDN） |
| `src/plugins/shiki-meta-transformer.mjs` | Shiki transformer：wrap / 行号 / 高亮 |
| `src/schema.mjs` | 文章 frontmatter schema（用 `astro/zod`，不用 `astro:content`） |
| `src/components/Sidenote.astro` | 核心交互组件 |
| `worker/src/index.ts` | R2 图床代理 + Image Transformations（模式 A） |
| `playground/astro.config.mjs` | 消费者用法的参考实现 |

## Implementation Progress

### Phase 1: Foundation - COMPLETED
- [x] Initialize Astro project with Cloudflare adapter
- [x] Configure Tailwind CSS 4.x + Typography plugin
- [x] Set up ET Book font loading (.woff format)
- [x] Create BaseLayout with Tufte container styling
- [x] Configure Content Collections with MDX support

### Phase 2: Components - COMPLETED
- [x] Sidenote.astro (CSS checkbox toggle for mobile)
- [x] Marginnote.astro (unnumbered margin notes)
- [x] Figure.astro / MarginFigure.astro
- [x] Blockquote.astro (author/source/url/epigraph)
- [x] Fullwidth.astro
- [x] Style prose elements (headings, blockquotes, code)

### Phase 3: Image System - COMPLETED
- [x] Remark plugin with dev/build dual mode
- [x] Vite dev middleware for local image serving
- [x] R2 Worker proxy with caching
- [x] Rclone sync template

### Phase 4: Polish - IN PROGRESS
- [x] Post listing on index page
- [x] Responsive layout fix
- [x] KaTeX math formula support (conditional loading)
- [x] Header / Footer components
- [x] Navigation pages (archive, links, about)
- [x] Multi-font stack (ET Book + EB Garamond + 霞鹜)
- [x] Content Layer API migration (content/ 与 src/ 解耦)
- [x] Cloudflare Image Transformations (Mode A: Worker Binding, Mode B: URL 预留)
- [ ] RSS feed
- [ ] Performance optimization (fonts)

**Math Support:**
- Enable with `math: true` in frontmatter
- KaTeX CSS only loaded when math is enabled
- Inline: `$E = mc^2$`, Display: `$$\int_0^\infty e^{-x^2} dx$$`

**Code Blocks:**
- Shiki 语法高亮，使用 `github-light` 主题
- 默认无边框、页面背景色、不换行、不显示行号（Tufte 简洁风格）
- 所有功能通过 meta string 按需启用：` ```go {wrap=true,lineno=true,hl_lines=["2-5"],linenostart=199} `
  - `wrap=true` — 启用自动换行
  - `lineno=true` — 显示行号 (CSS counters)
  - `linenostart=N` — 行号起始值
  - `hl_lines=["2-5","8"]` — 高亮指定行（支持范围）
- 行内高亮: `// [!code highlight]`（transformerNotationHighlight）
- 自定义 Shiki transformer: `src/plugins/shiki-meta-transformer.mjs`

## Notes for AI Assistants

- Always read existing files before modification
- Prefer editing over creating new files
- Keep solutions minimal; avoid unnecessary abstraction
- Test responsive behavior for all layout changes
- Consider CJK text rendering in typography decisions
- **本仓库是 npm 包，不是应用**：改动后用 `npm run dev` / `npm run build` 跑 playground 验证
- 新增导出文件（组件、页面、样式）必须同步加到 `package.json` 的 `exports`
- 新增被注入的路由要同时改 `integration.mjs` 的 `injectRoute` 和 `routes` 开关
- 站点相关的可配置项放进 `DEFAULT_SITE`，不要硬编码在组件里；同步更新 `virtual.d.ts`
- 主题内**避免使用 Tailwind 工具类**（Tailwind 不扫 node_modules）；用 scoped `<style>` 或 theme.css
- `integration.mjs` 与 `src/plugins/*` 保持 `.mjs`（config 期执行，不能是 TS）
- Image paths in MDX should use relative `./` syntax (transformed at build time by remark plugin)
- MDX component imports use `@laurenfrost/astro-tufte/components/*.astro`
- Content Layer API uses `post.id` (not `post.slug`) for article identification
- 私有内容绝不进本仓库；`private-blog/` 已被 gitignore
