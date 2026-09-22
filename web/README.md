# 拾光 SnapSaga · web/（工程化版本）

根目录的 `index.html` 是**单文件原型**（v0.6，仍然是当前线上入口之一）。这里是同一套功能的
**工程化版本**：React 19 + TypeScript（严格模式）+ Vite + Tailwind + Zustand，带真单测、真 e2e
与红线 guard。目的不是加功能，而是让后续修改更快、更不容易改坏。

> 铁律仍然成立：**根 `index.html` 一行都不改**。两个入口同源、同库、同 localStorage 键，互相读得懂对方的数据。

## 线上地址

- 工程化版本：<https://tomorrowdolol.github.io/snapsaga-trip-prototype/web/>
- 单文件原型：<https://tomorrowdolol.github.io/snapsaga-trip-prototype/>

Vite 必须 `base: './'`：线上是 `/snapsaga-trip-prototype/web/` 子路径，绝对路径会让 `/assets/*.js` 404。

## 目录结构

```
web/
├── app.html                   # Vite 源入口（只有 #root 与 <script type=module>）；故意不叫 index.html
├── index.html                 # 构建生成的入口页（引用 ./dist/ 产物）——Pages 的 /web/ 就是它，也要提交
├── package.json               # 依赖与命令（dev / build / test / guard / e2e / verify）
├── vite.config.ts             # base './' + react + tailwind + vitest(jsdom)
├── tsconfig.json              # 严格模式，零错误才允许 build
├── public/                    # 原样拷进 dist：sw.js / manifest.webmanifest / 图标（svg + png）
├── src/
│   ├── main.tsx               # 挂载 + 调试桥 + 注册 Service Worker
│   ├── App.tsx                # 五个视图都保持挂载（相机流与已解码网格不该被切页销毁）
│   ├── styles.css             # 视觉层：逐行移植自根 index.html 的 <style>，选择器/类名保持一致
│   ├── domain/                # 纯逻辑（可单测，不依赖 React）
│   │   ├── sun.ts             # 太阳算法（逐行等价搬迁，见下）
│   │   ├── genQueue.ts        # 生图队列调度引擎（依赖注入，纯逻辑）
│   │   ├── capture.ts         # 静止图像优先 + 一次性抓帧回落 + 按能力下约束
│   │   ├── thumbs.ts          # 缩略图（最长边 320 / jpeg .72）
│   │   ├── settings.ts        # localStorage 键名 + AI Base 取值逻辑
│   │   ├── aiRedraw.ts        # 唯一 AI 通道（aiRedrawCore）
│   │   ├── polaroid.ts        # 拍立得合成
│   │   ├── editFilter.ts      # 本地滤镜（离线可用）
│   │   ├── presets.ts         # 5 个风格 + 3 种胶片 + 注记文案
│   │   ├── scenes.ts          # 8 个场景卡与构图提示
│   │   ├── media.ts           # blob↔image / 保存分享
│   │   └── types.ts           # PhotoRec / QueueTask（字段与原型一致）
│   ├── data/db.ts             # IndexedDB：库名 snapsaga，仓 photos / queue（版本 2，只增不清）
│   ├── store/                 # Zustand：useAppStore + 相机运行时 + 队列单例
│   ├── hooks/useObjectUrl.ts  # blob → objectURL，卸载即回收
│   ├── components/            # 视图与面板（id/类名与原型对齐，旧验收脚本可直接跑）
│   ├── debug/bridge.ts        # window.__snapsaga + 兼容旧脚本的全局名（只读）
│   └── test/                  # Vitest（jsdom）单测
├── e2e/                       # Playwright 验收脚本（跑 dist 产物）
├── scripts/                   # guard.mjs（红线）/ publish-entry.mjs（生成 index.html）/ make-icons.mjs
└── tools/                     # 零依赖：playwright 解析 + 静态服务器
```

## 命令

```bash
npm install
npm run dev        # 本地开发（localhost 可绕过 HTTPS 限制测相机）
npm run build      # tsc --noEmit && vite build && 生成 web/index.html（TS 严格模式零错误才通过）
npm test           # Vitest + jsdom：队列调度 / 缩略图 / AI Base / 太阳算法等价性 / 相机取图
npm run guard      # 红线断言：源码侧 + 构建产物侧 + 产物运行时（真 Chromium 加载 dist）
npm run e2e        # Playwright 四组验收（需要先 build）
npm run verify     # build → test → guard → e2e 一条龙
```

`playwright` **不在 dependencies 里**（浏览器包很大）：`tools/playwright.mjs` 会先找本地
`node_modules`，再找全局安装。没有就跳过 guard 的运行时断言、e2e 直接报错。

## 数据兼容（重要）

新应用与根原型**同源**，用户现有数据必须能直接复用：

| 项目 | 值 |
|------|-----|
| IndexedDB | 库名 `snapsaga`；仓 `photos`(keyPath `id`) 与 `queue`(keyPath `id`)，版本 2 |
| 照片记录 | `{id, blob, ts, shot, thumb?, kind?, from?, style?, styleName?}`（含 `thumb`） |
| localStorage | `ss_ai_base` / `ss_ai_key` / `ss_ai_model` / `ss_gen_auto` / `ss_gen_style` / `snapsaga_geo` |
| AI 默认 Base | `https://api.klong.lat/v1`（未填过或等于旧默认 `https://api.openai.com/v1` 时用它；显式填过的自定义值尊重，去尾部斜杠） |

表结构升级只允许**新增版本 + 兼容迁移**，不许清库。老记录没有 `thumb` 字段时会在启动后
逐张后台回填（一次一张、让出主线程），补好即落库。

## 部署（以及一个要写清楚的权衡）

### 目录形状：为什么有 app.html 和 index.html 两个 HTML

GitHub Pages 请求目录时只会找 `index.html`，而 Vite 的源入口如果就叫 `web/index.html`，
构建产物又会盖掉它。所以：

| 文件 | 角色 |
|------|------|
| `web/app.html` | Vite **源入口**（产物 `dist/app.html`）—— 改界面改这里 |
| `web/dist/**` | 构建产物（**提交**） |
| `web/index.html` | `npm run build` **生成**的入口页（把引用改写成 `./dist/…`），`…/web/` 就是它（**提交，不要手改**） |

于是 `/web/` 与 `/web/dist/app.html` 都能打开应用；Service Worker 的路径由页面里的
`<link rel=manifest>` 反推（`sw.js` 在 manifest 旁边），两种入口都能拿到正确 scope。

### dist 要提交：权衡写清楚

GitHub Pages 目前**从分支直接提供、没有 CI 构建**，所以 `web/dist/` 与生成的 `web/index.html`
是**提交进仓库**的：

- ✅ 好处：push 到 main 约 1 分钟后线上就是最新产物，零 CI 依赖
- ❌ 代价：每次改前端都要「build 一次 → 把 dist 与 index.html 一起提交」，产物 diff 会进 git 历史
- ⏭ 以后可以把 Pages 源切成 **GitHub Actions**（build 后 upload-pages-artifact），
  那时就可以在 `web/.gitignore` 里加上 `dist/` 与 `index.html`，把产物从仓库里拿掉

`web/.gitignore` 只忽略 `node_modules` 等，**故意不忽略 `dist` 与 `index.html`**。

## 验证矩阵（`npm run verify`）

| 层 | 工具 | 数量 | 说明 |
|----|------|------|------|
| 单测 | Vitest + jsdom | 53 个测试 | 队列调度（并发峰值 4 / FIFO / 失败隔离重试 / 归档 / 刷新恢复）、缩略图尺寸与编码参数、AI Base 取值、太阳算法等价性、相机取图三环境与能力约束 |
| 验收 e2e | Playwright（真 Chromium + 真 IndexedDB，只 stub 相机与生图接口） | 75 项 | 主链路 35 / 缩略图与增量 13 / 拍照三环境与能力约束 17 / AI 默认 Base 10 |
| 红线 guard | node + Playwright | 61 项 | 源码侧 31 / 产物侧 18 / 产物运行时 5 / 子路径部署冒烟 7 |
| 构建 | tsc（严格）+ vite | — | `npm run build` 零错误 |

e2e 与 guard 的断言来自根原型的验收脚本（`../snapsaga_queue_check/*.cjs` 与 `ss_e2e.cjs`），
**断言逐条保留、未放松**。两处必要适配（都是"换了实现方式"，不是放宽）：

1. **objectURL 回收**：原型用「批次换 URL」，所以 `revoke ≈ create`；React 版把 URL 生命周期绑到
   元素上（挂载期间复用、卸载才 revoke），所以那条比例断言换成两条更强的不变量：
   「反复重渲染 created 增量为 0」+「删除一张图 → 该元素卸载且其 URL 被 revoke，活跃数不增长」。
2. **openai 常量出现次数**：原型源码内联在 HTML 里，React 版在构建产物 JS 里，所以那条断言改成
   「页面 HTML 里 0 处 + 产物里恰好 1 处」。

## 未覆盖 / 已知限制

- **真机相机路径仍未在 CI 里跑**：e2e 用 canvas 流 + ImageCapture stub，覆盖了三环境与降级逻辑，
  但真机 `takePhoto` 的分辨率提升只能靠 `../tools/ios-probe.html` 在手机上实测（K12/K13/K14 不变）。
- **AI 直连的 CORS 限制不变**（K3）：原型与新应用都是浏览器直连你配置的 Base，正式版走网关。
- 未用真实 Key 打通 `api.klong.lat`（无凭证）。
- 切后台页面被挂起的问题不变（K15）：队列只在页面活跃时推进。
- PWA 离线缓存是保守策略（导航 network-first、静态资源 stale-while-revalidate）；首次打开仍需网络。
  SW 的 scope 是 `/web/dist/`（sw.js 就在产物目录里），所以主屏安装后的 `start_url` 落在 scope 内、离线可用；
  而 `/web/` 入口页本身不在 scope 内（离线刷新 `/web/` 会失败，`/web/dist/app.html` 正常）——见 iteration-log K23。

## 改哪边？

| 想改的东西 | 改哪里 |
|-----------|--------|
| 体验/算法/队列等**真实功能** | `web/src/**`，然后 `npm run verify` → build → 提交 dist |
| 只想让线上原型立刻变一下（不想碰构建） | 根 `index.html`（记得三同步：版本号 + iteration-log） |
| 两者都要一致 | 优先改 `web/`（有测试守着），根原型只在必要时同步；`sun.ts` 的改动必须先跑等价性测试 |
