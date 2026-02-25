# CLAUDE.md - Tufte-Style Astro Blog

## Project Overview

A modern blog with Tufte-inspired scientific typography. Core features include sidenotes, margin notes, optimal CJK typography, and Cloudflare R2 image hosting.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Astro 5.x (SSR mode via `@astrojs/cloudflare`) |
| Deployment | Cloudflare Pages |
| Styling | Tailwind CSS 4.x + `@tailwindcss/typography` |
| Typography | ET Book + EB Garamond + 霞鹜字体 (CJK) |
| Content | Astro Content Layer API (MDX, glob loader) |
| Image Storage | Cloudflare R2 + Worker proxy |
| Sync | Rclone (local posts to R2) |

## Project Structure

```
/
├── content/                       # 内容目录（与 src/ 解耦）
│   └── posts/                     # 博客文章
│       ├── hello-world/
│       │   ├── index.mdx          # 文章正文
│       │   └── hero.jpg           # 文章图片（与文章同目录）
│       ├── test-text/
│       │   └── index.mdx
│       └── gps-coord/
│           └── index.mdx
├── src/
│   ├── content.config.ts          # Content Layer API 配置（glob loader）
│   ├── components/
│   │   ├── Header.astro           # Site header with navigation
│   │   ├── Footer.astro           # Site footer with credits
│   │   ├── Sidenote.astro         # Numbered sidenotes with CSS toggle
│   │   ├── Marginnote.astro       # Unnumbered margin notes
│   │   ├── Figure.astro           # Images with caption/credit
│   │   ├── MarginFigure.astro     # Small images in margin area
│   │   ├── Blockquote.astro       # Quotes with author/source
│   │   └── Fullwidth.astro        # Full-width content wrapper
│   ├── layouts/
│   │   └── BaseLayout.astro       # Tufte-style base layout
│   ├── pages/
│   │   ├── index.astro            # Homepage with post listing (wide mode)
│   │   ├── archive.astro          # 文章归档页 (wide mode)
│   │   ├── links.astro            # 友链页 (wide mode)
│   │   ├── about.astro            # 关于页 (wide mode)
│   │   └── posts/[...slug].astro  # Dynamic post pages (with sidenotes)
│   ├── plugins/
│   │   └── remark-image-assets.ts # Image path transformation (dev/build)
│   └── styles/
│       └── global.css             # @font-face, @theme, base styles
├── public/
│   └── fonts/                     # 字体文件
│       ├── et-book/               # ET Book 各字形
│       ├── EB_Garamond/           # EB Garamond 可变字体
│       └── Lxgw/                  # 霞鹜 CJK 字体
├── worker/                        # R2 image proxy Worker
│   ├── src/index.ts
│   ├── wrangler.toml
│   └── package.json
├── astro.config.mjs               # Astro + Cloudflare + Remark + Vite 中间件
├── tsconfig.json                  # Path aliases (@components/*)
├── rclone.conf.example            # R2 sync template
└── package.json
```

## Architecture Decisions

### 1. Rendering: SSR on Cloudflare Pages

Using `output: 'server'` with `@astrojs/cloudflare`. This enables:
- Dynamic features if needed in the future
- Edge rendering for optimal global performance
- Direct access to Cloudflare bindings (R2, KV, etc.)

### 2. Content Layer API with Glob Loader

使用 Astro 5 Content Layer API (`src/content.config.ts`)，通过 `glob` loader 从 `content/posts/` 加载文章。

**核心设计：**
- 内容目录 `content/` 与代码目录 `src/` 完全解耦
- 每篇文章一个目录：`content/posts/<slug>/index.mdx`
- 图片与文章同目录存放，方便写作管理
- MDX 中通过 `@components/` 路径别名引用组件（tsconfig paths）
- Content Layer 使用 `post.id` 而非 `post.slug` 标识文章

**Schema** (`src/content.config.ts`):
```typescript
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({
    pattern: '**/index.mdx',
    base: './content/posts',
    generateId: ({ entry }) => entry.replace(/\/index\.mdx$/, ''),
  }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).optional(),
    description: z.string().optional(),
    math: z.boolean().default(false),
  }),
});
```

**路径别名：**
MDX 文件位于 `content/` 目录外，通过 tsconfig `@components/*` → `src/components/*` 别名引用组件：
```mdx
import Sidenote from '@components/Sidenote.astro';
```

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

- Use Tailwind utility classes directly; avoid `@apply` except for prose customization
- Tufte color palette (matching official Tufte CSS):
  ```javascript
  colors: {
    tufte: {
      bg: '#fffff8',     // Cream paper background
      text: '#111',      // Near-black body text
    }
  }
  ```
- Links: inherit text color, distinguished by underline only (Tufte canonical style)
- Typography plugin customization via `prose-tufte` variant

### Typography & Font Configuration

**字体栈设计：**

| 使用场景 | 西文字体 | CJK 字体 | CSS 变量 |
|---------|---------|---------|----------|
| 正文 | ET Book → EB Garamond | 霞鹜新致宋 | `--font-serif` |
| 斜体 | ET Book Italic → EB Garamond Italic | 霞鹜心致宋 | `--font-serif-italic` |
| 引用 | ET Book → EB Garamond | 霞鹜文楷 | `--font-serif-quote` |

**字体文件结构：**
```
public/fonts/
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
# Install dependencies
npm install

# Development server (images served from local content/posts/)
npm run dev

# Production build (images point to CDN)
npm run build

# Preview production build locally
npm run preview

# Sync post images to R2 (preserves directory structure)
rclone sync content/posts r2:blog-images --include "*.{jpg,jpeg,png,gif,webp,avif,svg}" --config rclone.conf

# Deploy Worker
cd worker && npx wrangler deploy
```

## Key Files Reference

When modifying these files, understand their role:

| File | Purpose |
|------|---------|
| `astro.config.mjs` | Astro config, Cloudflare adapter, Remark plugins, Vite dev middleware |
| `src/content.config.ts` | Content Layer API schema + glob loader |
| `tsconfig.json` | Path aliases (`@components/*` → `src/components/*`) |
| `src/layouts/BaseLayout.astro` | Master layout with Tufte grid |
| `src/plugins/remark-image-assets.ts` | Image path transformation (dev: local, build: CDN) |
| `src/components/Sidenote.astro` | Core interactive component |
| `worker/src/index.ts` | R2 image proxy + Image Transformations (Mode A) |
| `worker/wrangler.toml` | Worker config: R2 binding (`R2_BUCKET`) + Images binding (`IMAGES`) |

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
- 支持行号显示 (CSS counters)
- 支持行高亮: meta 语法 ` ```js {1,3-5}` 或行内 `// [!code highlight]`

## Notes for AI Assistants

- Always read existing files before modification
- Prefer editing over creating new files
- Keep solutions minimal; avoid unnecessary abstraction
- Test responsive behavior for all layout changes
- Consider CJK text rendering in typography decisions
- Image paths in MDX should use relative `./` syntax (transformed at build time by remark plugin)
- MDX component imports use `@components/` alias, NOT relative paths
- Content Layer API uses `post.id` (not `post.slug`) for article identification
