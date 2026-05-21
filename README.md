# RMLive

RMLive 是面向 RoboMaster 风格赛事直播的 Web 直播间。它把直播播放器、实时赛况、赛程、排名、机器人数据、回放、弹幕、互动反应和嵌入式观看能力整合到一个响应式 Vue 应用中。

项目目标不是做一个通用视频站，而是服务赛事直播现场：稳定播放、快速切换视角和清晰度、移动端可用、数据刷新可靠，并且支持通过 iframe 注入到其他页面。

## 功能特性

- 基于 Artplayer 和 hls.js 的 HLS 直播播放
- 移动端原生全屏，桌面端网页全屏
- 播放器内集成清晰度和多视角切换
- 直播流卡顿、网络错误和 HLS 异常恢复
- 当前比赛、下一场比赛、赛程、分组、排名和机器人数据展示
- LeanCloud Realtime 弹幕、队伍支持和互动反应
- PWA manifest、Service Worker、版本更新和比赛通知
- iframe injector 构建产物，支持外部页面嵌入
- mock 模式，便于本地开发时脱离远程 live JSON 数据
- GitHub Actions 自动构建并部署到腾讯云 COS/CDN

## 技术栈

- Vue 3
- TypeScript
- Vite
- Pinia
- PrimeVue
- Tailwind CSS
- Artplayer
- hls.js
- Workbox / vite-plugin-pwa
- Vitest
- ESLint / Stylelint

## 快速开始

### 环境要求

- Node.js 22 或更高版本
- pnpm 10.32.1 或更高版本

### 安装依赖

```bash
pnpm install
```

### 启动开发环境

使用默认开发代理：

```bash
pnpm dev
```

使用本地 mock 数据：

```bash
pnpm dev:mock
```

### 构建

构建主应用：

```bash
pnpm build
```

构建 iframe 注入脚本：

```bash
pnpm build:iframe
```

构建完整生产产物：

```bash
pnpm build:all
```

### 本地预览

```bash
pnpm preview
```

## 环境变量

复制 `.env.example` 到 `.env`，按需要填写本地或部署环境使用的变量。

| 变量 | 是否必需 | 说明 |
| --- | --- | --- |
| `VITE_LIVEJSON_PROXY` | 否 | live JSON 代理地址。为空时开发环境使用 Vite proxy，生产环境按代码中的默认静态源回退。 |
| `VITE_IMG_PROXY` | 否 | 图片代理地址，用于队徽和远程图片。 |
| `VITE_IFRAME_APP_URL` | 否 | iframe injector 嵌入的应用地址，默认 `https://rmlive.scutbot.cn`。 |
| `VITE_CHATROOM_APP_ID` | 弹幕必需 | LeanCloud 应用 ID。 |
| `VITE_CHATROOM_APP_KEY` | 弹幕必需 | LeanCloud 应用 Key。 |
| `VITE_ENGAGEMENT_CHATROOM_ID` | 互动必需 | LeanCloud 互动房间 ID。 |
| `VITE_ENGAGEMENT_QUERY_WINDOW_MINUTES` | 否 | 查询互动历史的时间窗口，默认 `30` 分钟。 |

代理变量应填写完整 base URL。应用不会自动追加 `/static`。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 Vite 开发服务器。 |
| `pnpm dev:mock` | 使用 mock live JSON 启动开发服务器。 |
| `pnpm build` | 类型检查并构建主应用。 |
| `pnpm build:iframe` | 构建 `iframe-inject.js`。 |
| `pnpm build:all` | 构建主应用和 iframe injector。 |
| `pnpm preview` | 本地预览生产构建。 |
| `pnpm test:run` | 运行 Vitest。 |
| `pnpm check` | 运行测试和主应用构建。 |
| `pnpm lint` | 运行 ESLint。 |
| `pnpm lint:fix` | 运行 ESLint 自动修复。 |
| `pnpm stylelint` | 检查样式文件。 |
| `pnpm stylelint:fix` | 自动修复样式问题。 |

## 目录结构

```text
src/
  api/          远程数据请求和轮询
  components/   Vue 组件和直播间界面
  composables/  可复用组合式逻辑
  danmu/        弹幕和互动客户端
  lib/          IndexedDB 与 Service Worker 辅助逻辑
  stores/       Pinia 状态管理
  styles/       全局样式
  types/        共享 TypeScript 类型
  utils/        数据归一化和 URL 工具
  workers/      直播数据和 IM Web Worker
  sw.ts         自定义 Service Worker
  iframe-inject.ts
```

## PWA 与 Service Worker

RMLive 使用 `vite-plugin-pwa` 的 `injectManifest` 模式。当前 Service Worker 主要负责：

- 预缓存静态 app shell
- 比赛通知轮询
- 通过 `SKIP_WAITING` 安全激活新版本

直播数据、HLS 流和实时 API 不应被 Service Worker 缓存。相关请求应保持网络优先或 `no-store`，避免直播期间拿到过期数据。

## iframe 嵌入

`pnpm build:iframe` 会生成独立的 `dist/iframe-inject.js`。该脚本用于把 RMLive 注入到外部页面，并通过 `VITE_IFRAME_APP_URL` 指定实际加载的应用地址。

## 部署

仓库包含部署到腾讯云 COS/CDN 的 GitHub Actions workflow。推送到 `release` 分支时会自动：

1. 安装依赖
2. 构建主应用和 iframe injector
3. 上传 `dist` 到腾讯云 COS
4. 为 `index.html`、`sw.js`、`manifest.webmanifest`、`iframe-inject.js` 设置 no-cache
5. 刷新 CDN 中的 app shell URL

部署所需 secrets / variables 在 GitHub 仓库中配置：

- `TENCENT_CLOUD_SECRET_ID`
- `TENCENT_CLOUD_SECRET_KEY`
- `COS_BUCKET`
- `COS_REGION`
- `VITE_CHATROOM_APP_ID`
- `VITE_CHATROOM_APP_KEY`
- `VITE_ENGAGEMENT_CHATROOM_ID`
- `VITE_LIVEJSON_PROXY`
- `VITE_IMG_PROXY`

## 贡献

欢迎提交 issue 和 pull request。参与前请阅读 [CONTRIBUTION.md](./CONTRIBUTION.md)。

直播、移动端、PWA、播放器和部署相关改动请在 PR 中写清楚验证方式和潜在风险。

## 许可证

RMLive 使用 GNU General Public License v3.0 发布。详情见 [LICENSE](./LICENSE)。
