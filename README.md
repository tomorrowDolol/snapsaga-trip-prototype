# 拾光 SnapSaga

> 出门玩的时候，人人都能拍出会讲故事的照片。
> Flutter 移动端 App（规划）· 现阶段为网页出行原型（两个入口）+ 设计文档。

## 快速入口

| 内容 | 位置 |
|------|------|
| 📱 **出行原型（单文件，v0.6 冻结）** | <https://tomorrowdolol.github.io/snapsaga-trip-prototype/> |
| ⚛️ **工程化版本（React + TS，v0.8）** | <https://tomorrowdolol.github.io/snapsaga-trip-prototype/web/> · 说明见 [web/README.md](web/README.md) |
| 📊 **当前状态 / 活跃问题 / 版本摘要（先读这个）** | [docs/iteration-log.md](docs/iteration-log.md) |
| 🗄 迭代历史归档（v0.1–v0.8 明细、实测数字） | [docs/iteration-history.md](docs/iteration-history.md) |
| 🎨 产品设计稿（交互 HTML，可在线打开） | [docs/design-v0.1.html](docs/design-v0.1.html) · [在线版](https://tomorrowdolol.github.io/snapsaga-trip-prototype/docs/design-v0.1.html) |
| 🗓 P0 落地计划（8 周 WBS / 验收门槛 / 风险） | [docs/p0-plan.md](docs/p0-plan.md) |
| 🤖 AI 代理工作指南（改代码前先读） | [AGENTS.md](AGENTS.md) |

> 当前原型 v0.6（单文件）：拍照与 AI 生图解耦——按快门只存胶卷，生图进后台队列，完成后归档到「AI 相册」。
> v0.7 起同一套功能另有工程化版本 `web/`（React 19 + TypeScript + Vite），v0.8 起 `web/` **以「主题模式」为中心**
> （写一句主题 → 选 2–9 张图 → 合成一张 / 统一风格；统一风格可「边拍边收」），并发上限按设计稿提到 **9**。
> **两者同源同库**：同一个 IndexedDB（`snapsaga` 仍是 v2，主题记录另存 `snapsaga_themes`）、同一批 localStorage 键，数据直接复用。

## 文档地图

> 全仓库的文档入口都在这里；新增文档必须登记到本表（`node scripts/check-docs.mjs` 会校验）。

| 文档 | 定位（一句话） |
|------|----------------|
| [AGENTS.md](AGENTS.md) | **AI 代理的操作契约**：铁律 + 标准改动流程（改代码前先完整读） |
| [README.md](README.md) | 本文件：总览、线上入口、目录结构、**部署形状（单一真源）**、本地验证、正式版路线 |
| [docs/iteration-log.md](docs/iteration-log.md) | 面向迭代的**首屏**：当前状态 + 活跃已知问题 + 设计内取舍 + 版本摘要 + 下一版候选 |
| [docs/iteration-history.md](docs/iteration-history.md) | **归档**：v0.1–v0.8 详细验证记录、实测数字表、已解决 K 条目原文 |
| [docs/p0-plan.md](docs/p0-plan.md) | **工程路线真源**：P0 8 周计划、技术决策 D1–D5、里程碑 Gate、风险登记簿 |
| [docs/design-v0.1.html](docs/design-v0.1.html) | **产品功能定义真源**：定位 / 四大模块 / 架构 / Prompt 策略 / 路线图 |
| [web/README.md](web/README.md) | 工程化版专属：目录、命令、数据兼容（键名/库名）、验证矩阵、未覆盖项 |

## 目录结构

```
├── index.html            # 出行原型 v0.6（单文件应用，无构建、无依赖）
├── web/                  # 工程化版本 v0.8（React 19 + TS 严格 + Vite + Tailwind + Zustand）
│   ├── app.html          # Vite 源入口（改界面改它）
│   ├── index.html        # 构建生成的入口页（不要手改；Pages 的 /web/ 就是它）
│   ├── src/              # domain（纯逻辑）/ data（IndexedDB）/ store / components / debug / test
│   ├── public/           # sw.js / manifest.webmanifest / 图标
│   ├── e2e/              # Playwright 验收脚本（跑构建产物）
│   ├── scripts/          # guard.mjs（红线断言）、publish-entry.mjs、make-icons.mjs
│   ├── dist/             # 构建产物（**不提交**，由 CI 构建后上传）
│   └── README.md         # 工程化版专属说明
├── docs/
│   ├── design-v0.1.html      # 产品设计稿（功能定义真源）
│   ├── p0-plan.md            # P0 落地计划（工程路线真源）
│   ├── iteration-log.md      # 当前状态 / 活跃问题 / 版本摘要（首屏）
│   └── iteration-history.md  # 迭代历史归档（v0.1–v0.8 明细）
├── scripts/
│   ├── assemble-site.mjs     # 组装要发布的站点目录（CI 与本地同一份逻辑）
│   └── check-docs.mjs        # 文档防腐烂检查（链接 / K 编号 / 文档地图 / 版本号）
├── tools/
│   ├── check_gen_queue.mjs   # 开发用验证脚本（零依赖）：从 index.html 抽真实队列源码跑断言
│   └── ios-probe.html        # 真机能力探测页（相机取图 / IndexedDB / 切后台 / Web Share）
└── .github/workflows/deploy-pages.yml   # 发布管线：build（门禁）+ deploy
```

## 部署形状

> **单一真源**：部署只在本文写一份；`AGENTS.md`、[web/README.md](web/README.md)、[docs/iteration-log.md](docs/iteration-log.md)
> 都只留一句 + 链到本节。**没有构建产物提交**：`web/dist` 不提交。

GitHub Pages 由 **GitHub Actions** 发布（`build_type: workflow`）。推送 `main` 即触发
`.github/workflows/deploy-pages.yml`：

```
npm ci → npm test（53 项）→ npm run build → 装 Playwright Chromium → npm run guard（61 项）
        → node scripts/assemble-site.mjs _site → upload-pages-artifact → deploy-pages
```

站点形状由 [scripts/assemble-site.mjs](scripts/assemble-site.mjs) 定义（CI 与本地同一份逻辑，缺失产物会直接报错）：

| 线上路径 | 来源 | 说明 |
|----------|------|------|
| `/` | 根 `index.html` | 单文件原型，冻结在 v0.6 |
| `/web/` 的功能面 | `web/dist/**` | v0.8 起以「主题模式」为中心：主题（两种产出 / 边拍边收）· 暗房（并发 9）· 相册三分组 |
| `/docs/` `/tools/` | 同目录 | 文档与工具页（含 `ios-probe.html`） |
| `/web/` | `web/index.html` + `web/dist/**` | React 版（入口页与产物都由 `npm run build` 生成） |

- **为什么要两个 HTML**：Pages 请求目录只会找 `index.html`，而 Vite 源入口若叫 `web/index.html`，
  构建产物会盖掉它。所以源入口是 `web/app.html`（改界面改它），`web/index.html` 是构建生成的入口页
  （引用 `./dist/…`，**不要手改**，必须提交）。
- 改前端后本地复现线上形状：`cd web && npm run verify` → `node scripts/assemble-site.mjs _site` →
  用静态服务器打开 `_site/`。
- 踩过的坑：第一次推送后 `…/web/` 返回 200 但资源全 404。guard 的「子路径部署冒烟」现在会按 Pages 的
  目录形状访问 `/web/`，路径再错当场红。

## 本地验证

```bash
# —— 文档（秒级，零依赖）——
node scripts/check-docs.mjs        # 内部链接 / K 编号 / 文档地图 / 版本号与页头一致

# —— 单文件原型（根 index.html）——
python3 -c "..."                  # 1. HTML 标签闭合（html.parser）
# 2. 抽出全部 <script> 跑 node --check
node tools/check_gen_queue.mjs    # 3. 生图队列：FIFO / 失败重试 / 刷新恢复 / 归档（根原型单文件版仍是并发 4）

# —— 工程化版本（web/）——
cd web
npm install
npm run verify                    # build + test + guard + e2e 一条龙
```

`tools/` 与 `scripts/` 里的脚本只是开发验证工具，不是运行时依赖，不影响「单文件原型」这条约束。

## 如何迭代

1. **先判断改哪个入口**（详见 [AGENTS.md](AGENTS.md) 铁律 1）：
   - 真实功能 / 算法 / 队列 → 改 `web/src/**`，`npm run verify` 全绿后提交（`web/dist` 由 CI 构建，不用提交）
   - 只让线上原型立刻变一下、不想碰构建 → 改根 `index.html`（单文件，无构建、无依赖，仍需三同步）
2. 推送 `main` 触发 CI 构建 + 门禁 + 发布，**约 1–2 分钟线上生效**，手机刷新即见
3. 每次改动同步 `docs/iteration-log.md`（版本摘要 / 活跃问题变化），详细验证记录写进 `docs/iteration-history.md`
4. 移动端验证：两个入口都需 HTTPS 环境才能调用相机（Pages 天然满足）；本地调试可用
   `python3 -m http.server` 配合浏览器 localhost（`web/` 用 `npm run dev`），或任意静态托管

## 正式版路线

原型验证体验后，按 [docs/p0-plan.md](docs/p0-plan.md) 推进 Flutter 正式版（相机引导 / 拍立得 / 主题修图走
gpt-image-2 网关，comic 为 P1）。正式版代码预计落在本仓库 `app/` 目录，原型（根 `index.html` 与 `web/`）
继续当体验入口与设计对照。
