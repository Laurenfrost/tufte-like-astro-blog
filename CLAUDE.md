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
| Content | Astro Content Collections (MDX) |
| Image Storage | Cloudflare R2 + Worker proxy |
| Sync | Rclone (local assets to R2) |

## Project Structure

```
/
├── src/
│   ├── components/
│   │   ├── Header.astro          # Site header with navigation
│   │   ├── Footer.astro          # Site footer with credits
│   │   ├── Sidenote.astro        # Numbered sidenotes with CSS toggle
│   │   ├── Marginnote.astro      # Unnumbered margin notes
│   │   ├── Figure.astro          # Images with caption/credit
│   │   ├── MarginFigure.astro    # Small images in margin area
│   │   ├── Blockquote.astro      # Quotes with author/source
│   │   └── Fullwidth.astro       # Full-width content wrapper
│   ├── content/
│   │   ├── config.ts             # Content Collections schema
│   │   └── posts/                # Blog posts (MDX)
│   │       └── hello-world.mdx   # Example post with sidenotes
│   ├── layouts/
│   │   └── BaseLayout.astro      # Tufte-style base layout
│   ├── pages/
│   │   ├── index.astro           # Homepage with post listing (wide mode)
│   │   ├── archive.astro         # 文章归档页 (wide mode)
│   │   ├── links.astro           # 友链页 (wide mode)
│   │   ├── about.astro           # 关于页 (wide mode)
│   │   └── posts/[...slug].astro # Dynamic post pages (with sidenotes)
│   ├── plugins/
│   │   └── remark-image-assets.ts # Image path transformation
│   └── styles/
│       └── global.css            # @font-face, @theme, base styles
├── public/
│   └── fonts/                    # 字体文件
│       ├── et-book/              # ET Book 各字形
│       ├── EB_Garamond/          # EB Garamond 可变字体
│       └── Lxgw/                 # 霞鹜 CJK 字体
├── content/
│   └── assets/                   # Source images (git-ignored)
├── worker/                       # R2 image proxy Worker
│   ├── src/index.ts
│   ├── wrangler.toml
│   └── package.json
├── astro.config.mjs              # Astro + Cloudflare + Remark config
├── rclone.conf.example           # R2 sync template
└── package.json
```

## Architecture Decisions

### 1. Rendering: SSR on Cloudflare Pages

Using `output: 'server'` with `@astrojs/cloudflare`. This enables:
- Dynamic features if needed in the future
- Edge rendering for optimal global performance
- Direct access to Cloudflare bindings (R2, KV, etc.)

### 2. Content Collections with MDX

All blog posts use Content Collections for type-safe frontmatter validation.

**Schema example** (`src/content/config.ts`):
```typescript
import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).optional(),
    description: z.string().optional(),
  }),
});

export const collections = { posts };
```

### 3. Tufte Grid System

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

### 4. Image Pipeline

```
Local: content/assets/*.jpg
         │
         ▼ (rclone sync)
R2 Bucket: blog-images/
         │
         ▼ (Worker proxy)
Public URL: https://img.yourdomain.com/filename.jpg?w=800
```

Remark plugin transforms `./assets/image.jpg` → production URL during build.

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

### Accessibility

- Sidenote references must be focusable with proper `aria-describedby`
- Minimum touch target 44x44px for mobile sidenote toggles
- Maintain sufficient color contrast (WCAG AA minimum)

## Development Commands

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build

# Preview production build locally
npm run preview

# Sync images to R2
rclone sync content/assets r2:blog-images --config rclone.conf

# Deploy Worker
cd worker && npx wrangler deploy
```

## Implementation Progress

### Phase 1: Foundation - COMPLETED
- [x] Initialize Astro project with Cloudflare adapter
- [x] Configure Tailwind CSS 4.x + Typography plugin
- [x] Set up ET Book font loading (.woff format)
- [x] Create BaseLayout with Tufte container styling
- [x] Configure Content Collections with MDX support

**Key Implementation Notes:**
- Using `npm` as package manager (not pnpm)
- ET Book fonts stored in `public/fonts/` (.woff format from hugo-tufte-cjk)
- Global styles in `src/styles/global.css` with `@theme` CSS variables
- SSR mode with dynamic routing for posts (`getEntry` instead of `getStaticPaths`)

### Phase 2: Components - COMPLETED
- [x] Implement Sidenote.astro (CSS checkbox toggle for mobile)
- [x] Implement Marginnote.astro (unnumbered margin notes)
- [x] Implement Fullwidth.astro (full-width content wrapper)
- [x] Style prose elements (headings, blockquotes, code)

**Components:**
- `Sidenote.astro` - 带编号的旁注
- `Marginnote.astro` - 无编号的边注
- `Figure.astro` - 图片，支持 caption/credit/fullwidth
- `MarginFigure.astro` - 边注区域的小图
- `Blockquote.astro` - 引用，支持 author/source/url/epigraph
- `Fullwidth.astro` - 全宽内容包装器

### Phase 3: Image System - COMPLETED
- [x] Write Remark plugin (`src/plugins/remark-image-assets.ts`)
- [x] Create Worker proxy with caching (`worker/`)
- [x] Configure rclone sync template (`rclone.conf.example`)

**Image Path Transformation:**
- In MDX: `./assets/image.jpg` → `https://img.yourdomain.com/image.jpg`
- Configure `IMAGE_BASE_URL` env variable in production

**Deployment Steps:**
1. Create R2 bucket named `blog-images` in Cloudflare dashboard
2. Copy `rclone.conf.example` to `rclone.conf` and add credentials
3. Deploy worker: `cd worker && npm install && npm run deploy`
4. Configure custom domain for worker in Cloudflare dashboard

### Phase 4: Polish - IN PROGRESS
- [x] Implement post listing on index page
- [x] Fix responsive layout (sidenotes no longer cause horizontal scroll)
- [x] Add KaTeX math formula support (conditional loading)
- [x] Implement Header and Footer components
- [x] Add navigation pages (archive, links, about)
- [x] Configure multi-font stack (ET Book + EB Garamond + 霞鹜)
- [ ] Add RSS feed
- [ ] Performance optimization (fonts, images)

**Header/Footer:**
- `Header.astro`: 博客名称、描述、导航菜单 (HOME, ARCHIVE, FRIENDS, ABOUT)
- `Footer.astro`: Credit 和 Copyright 信息
- 两者宽度与容器全宽一致

**Math Support:**
- Enable with `math: true` in frontmatter
- KaTeX CSS only loaded when math is enabled
- Inline: `$E = mc^2$`, Display: `$$\int_0^\infty e^{-x^2} dx$$`

**Code Blocks:**
- Shiki 语法高亮，使用 `github-light` 主题
- 支持行号显示 (CSS counters)
- 支持行高亮: meta 语法 ` ```js {1,3-5}` 或行内 `// [!code highlight]`

## Key Files Reference

When modifying these files, understand their role:

| File | Purpose |
|------|---------|
| `astro.config.mjs` | Astro config, Cloudflare adapter, Remark plugins |
| `tailwind.config.mjs` | Theme colors, typography customization, font stack |
| `src/layouts/BaseLayout.astro` | Master layout with Tufte grid |
| `src/content/config.ts` | Content Collections schema |
| `src/components/Sidenote.astro` | Core interactive component |
| `worker/src/index.ts` | R2 image proxy logic |

## Notes for AI Assistants

- Always read existing files before modification
- Prefer editing over creating new files
- Keep solutions minimal; avoid unnecessary abstraction
- Test responsive behavior for all layout changes
- Consider CJK text rendering in typography decisions
- Image paths in MDX should use relative `./assets/` syntax (transformed at build time)
