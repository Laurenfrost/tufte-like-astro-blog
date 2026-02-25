# Tufte Style Blog

一个基于 Astro 构建的现代博客，采用 Edward Tufte 的经典科学排版风格。支持侧边旁注、边注、中英文混排优化，并使用 Cloudflare R2 进行图片托管。

## 特性

- **Tufte 排版风格** - 经典的侧边旁注（Sidenotes）和边注（Margin notes）设计
- **CJK 优化** - 针对中日韩文字的行高、字体栈和混排优化
- **响应式设计** - 桌面端边注显示在右侧，移动端折叠为可点击展开
- **零 JavaScript** - 边注交互完全基于 CSS checkbox 技巧实现
- **边缘部署** - 基于 Cloudflare Pages SSR，全球边缘节点加速
- **R2 图片托管** - 通过 Worker 代理访问 R2 存储的图片，自动转换为 AVIF/WebP
- **数学公式** - 基于 KaTeX 的数学公式渲染，按需加载

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Astro 5.x (SSR) |
| 部署 | Cloudflare Pages |
| 样式 | Tailwind CSS 4.x + Typography |
| 字体 | ET Book + EB Garamond + 霞鹜字体 |
| 内容 | Astro Content Layer API (MDX) |
| 图片 | Cloudflare R2 + Worker + Image Transformations |

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器（图片从本地加载）
npm run dev

# 构建生产版本（图片指向 CDN）
npm run build

# 预览生产构建
npm run preview
```

## 项目结构

```
├── content/                    # 内容目录（与 src/ 解耦）
│   └── posts/                  # 博客文章
│       ├── hello-world/
│       │   ├── index.mdx       # 文章正文
│       │   └── hero.jpg        # 图片与文章同目录
│       └── another-post/
│           └── index.mdx
├── src/
│   ├── content.config.ts       # Content Layer API 配置
│   ├── components/             # Tufte 风格组件
│   │   ├── Sidenote.astro      # 带编号的旁注
│   │   ├── Marginnote.astro    # 无编号的边注
│   │   ├── Figure.astro        # 图片（支持说明和来源）
│   │   ├── MarginFigure.astro  # 边注区域的小图
│   │   ├── Blockquote.astro    # 引用（支持作者和来源）
│   │   └── Fullwidth.astro     # 全宽内容
│   ├── layouts/                # 页面布局
│   ├── pages/                  # 路由页面
│   ├── plugins/                # Remark 插件
│   └── styles/                 # 全局样式
├── public/fonts/               # ET Book + EB Garamond + 霞鹜字体
├── worker/                     # R2 图片代理 + Image Transformations Worker
│   ├── src/index.ts            # Worker 逻辑（R2 读取 → 格式转换 → 缓存）
│   └── wrangler.toml           # Bindings: R2_BUCKET + IMAGES
└── astro.config.mjs            # Astro 配置 + Vite 开发中间件
```

## 架构

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Pages                      │
│                  Astro SSR (边缘渲染)                     │
│                                                         │
│  content/posts/ ──→ Astro Content Layer ──→ HTML 页面    │
│  (MDX + 图片)        (glob loader)                      │
│                                                         │
│  图片 URL 由 Remark 插件在构建时转换：                      │
│  ./photo.jpg → https://worker-url/posts/slug/photo.jpg  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼ 浏览器请求图片
┌─────────────────────────────────────────────────────────┐
│                   Cloudflare Worker                      │
│                                                         │
│  1. 检查 Cache API（命中 → 直接返回）                      │
│  2. 从 R2 读取原图                                       │
│  3. Images Binding 格式转换：                             │
│     Accept: image/avif → AVIF (quality=80)              │
│     Accept: image/webp → WebP (quality=80)              │
│     其他 → 原格式压缩                                    │
│  4. 写入 Cache API，返回响应                              │
│                                                         │
│  ⚡ SVG / GIF 跳过变换，直接返回原图                       │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Cloudflare R2 存储桶                         │
│  posts/<slug>/photo.jpg  (由 rclone 从本地同步)           │
└─────────────────────────────────────────────────────────┘
```

### Tufte 栅格布局

```
┌─────────────────────────────────────────┐
│           .tufte-container              │  ← max-width 容器
│  ┌───────────────────────────────────┐  │
│  │            Header                 │  │
│  ├───────────────────────────────────┤  │
│  │  ┌─────────────┬─────────────┐    │  │
│  │  │   正文内容   │  Sidenote   │    │  │  ← 右侧 padding 预留
│  │  │   (60%)     │   区域      │    │  │
│  │  │             │   (40%)     │    │  │
│  │  └─────────────┴─────────────┘    │  │
│  ├───────────────────────────────────┤  │
│  │            Footer                 │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

- 桌面端：Sidenote 显示在右侧边注区域
- 移动端：Sidenote 折叠为可点击展开（纯 CSS，零 JS）
- `wide` 模式页面（首页、归档等）不保留边注空间，正文扩展到全宽

## 写作指南

### 创建新文章

在 `content/posts/` 下创建以文章 slug 命名的目录，包含 `index.mdx`：

```
content/posts/my-new-post/
  index.mdx
  photo.jpg        # 图片与文章放在一起
```

**Frontmatter：**

```yaml
---
title: "文章标题"
subtitle: "可选副标题"
date: 2024-01-01
description: "文章描述"
tags: ["标签1", "标签2"]
math: true  # 启用数学公式（可选）
draft: false
---
```

### 使用组件

MDX 中通过 `@components/` 路径别名引用组件：

```mdx
import Sidenote from '@components/Sidenote.astro';
import MarginNote from '@components/MarginNote.astro';

这是正文内容。<Sidenote id="sn1">这是带编号的旁注内容。</Sidenote>

这里需要补充说明。<MarginNote id="mn1">这是不带编号的边注。</MarginNote>
```

可用组件：`Sidenote`、`MarginNote`、`Figure`、`MarginFigure`、`Blockquote`、`Cite`、`Ruby`、`Fullwidth`。

### 使用图片

图片与文章放在同一目录下，MDX 中使用相对路径引用：

```markdown
![图片描述](./photo.jpg)
```

| 模式 | `./photo.jpg` 解析为 | 来源 |
|------|---------------------|------|
| Dev  | `/<slug>/photo.jpg` | Vite 中间件从本地文件系统读取 |
| Build | `https://img.example.com/<slug>/photo.jpg` | Cloudflare R2 via Worker |

**带说明和来源的图片**（Figure 组件）：

```mdx
import Figure from '@components/Figure.astro';

<Figure
  src="./photo.jpg"
  alt="图片描述"
  caption="这是图片的说明文字"
  credit="摄影：张三，2024"
/>

<!-- 全宽图片 -->
<Figure src="./wide.jpg" alt="宽幅图片" caption="横跨主栏和边注区域" fullwidth />
```

**边注区域的小图**（MarginFigure 组件）：

```mdx
import MarginFigure from '@components/MarginFigure.astro';

正文内容。<MarginFigure id="mf1" src="./diagram.jpg" alt="示意图" caption="边注小图" />
```

### 使用数学公式

在 frontmatter 中启用 `math: true`，然后使用 LaTeX 语法：

```markdown
行内公式：质能方程 $E = mc^2$ 是物理学的基础。

独立公式块：

$$
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$
```

### 使用引用

```mdx
import Blockquote from '@components/Blockquote.astro';

<Blockquote author="Edward Tufte" source="The Visual Display of Quantitative Information">
  Excellence in statistical graphics consists of complex ideas communicated
  with clarity, precision, and efficiency.
</Blockquote>

<!-- Epigraph 风格（用于章节开头） -->
<Blockquote author="老子" source="道德经" epigraph>
  道可道，非常道。名可名，非常名。
</Blockquote>
```

## 图片系统配置

图片系统支持两种模式，可通过环境变量切换：

| | 模式 A：Worker Binding | 模式 B：URL 方式 |
|---|---|---|
| **适用场景** | 无自定义域名（当前） | 有自定义域名 |
| **变换方式** | Worker 内 Images Binding | Cloudflare 边缘 `/cdn-cgi/image/` |
| **需要 Worker** | 是 | 否 |

### 模式 A 配置（当前使用）

#### 1. 创建 R2 存储桶

在 Cloudflare Dashboard 中创建名为 `tufte-style-blog-test` 的 R2 存储桶。

#### 2. 配置 Rclone 并同步图片

```bash
cp rclone.conf.example rclone.conf
# 编辑 rclone.conf，填入你的 R2 凭证

# 仅同步图片文件，保留文章目录结构
rclone sync content r2:tufte-style-blog-test \
  --include "*.{jpg,jpeg,png,gif,webp,avif,svg}" \
  --config rclone.conf
```

#### 3. 部署 Worker

```bash
cd worker
npm install
npx wrangler deploy
```

Worker 会自动根据浏览器 `Accept` header 返回最优格式（AVIF > WebP > 原格式），quality=80。

#### 4. 配置环境变量

在 Cloudflare Pages 项目设置中添加：

```
IMAGE_BASE_URL=https://your-worker.workers.dev
```

#### 5. 本地测试 Worker

```bash
# Images Binding 需要 --remote 标志
cd worker && npx wrangler dev --remote

# 测试格式转换
curl -H "Accept: image/avif" http://localhost:8787/posts/hello-world/hero.jpg -I
curl -H "Accept: image/webp" http://localhost:8787/posts/hello-world/hero.jpg -I
```

### 模式 B 配置（将来有域名时）

前提：R2 Bucket 绑定自定义域名 + 启用 Image Transformations。

只需设置环境变量即可切换，无需改代码：

```
IMAGE_BASE_URL=https://img.yourdomain.com
IMAGE_TRANSFORM_OPTIONS=format=auto,quality=80
```

此模式下 Worker 可废弃，Cloudflare 边缘自动处理图片变换和缓存。

## 部署

### Cloudflare Pages

1. 将代码推送到 GitHub/GitLab
2. 在 Cloudflare Dashboard 中连接仓库
3. 构建命令：`npm run build`
4. 输出目录：`dist`

### 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `IMAGE_BASE_URL` | 图片服务地址 | `https://your-worker.workers.dev` |
| `IMAGE_TRANSFORM_OPTIONS` | 模式 B URL 变换参数（可选） | `format=auto,quality=80` |

## 自定义

### 颜色主题

编辑 `src/styles/global.css` 中的 `@theme` 部分：

```css
@theme {
  --color-tufte-bg: #fffff8;    /* 背景色 */
  --color-tufte-text: #111;     /* 文字色 */
}
```

### 字体

本项目使用以下开源字体：

| 字体 | 用途 | 许可证 |
|------|------|--------|
| [ET Book](https://github.com/edwardtufte/et-book) | 西文正文 | MIT License |
| [EB Garamond](https://github.com/octaviopardo/EBGaramond12) | 西文 fallback | SIL OFL 1.1 |
| [霞鹜新致宋](https://github.com/lxgw/LxgwNeoZhiSong) | CJK 正文 | IPA Font License 1.0 |
| [霞鹜文楷](https://github.com/lxgw/LxgwWenKai) | CJK 引用 | SIL OFL 1.1 |
| [霞鹜心致宋](https://github.com/lxgw/LxgwHeartSerif) | CJK 斜体 | IPA Font License 1.0 |

所有字体均可免费商用。字体文件位于 `public/fonts/` 目录。

修改 `src/styles/global.css` 中的 `@theme` 部分可自定义字体栈。

## 许可证

MIT
