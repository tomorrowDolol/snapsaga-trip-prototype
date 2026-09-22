# AGENTS.md — AI 代理工作指南

任何 AI 代理（Codex / Claude Code / Pi 等）在本仓库干活前，**先完整读完本文件再动手**。

## 项目一句话

「拾光 SnapSaga」：旅拍创作 App。当前阶段 = 网页出行原型 + 设计文档；Flutter 正式版尚未开工。产品功能定义以 `docs/design-v0.1.html` 为准，工程路线以 `docs/p0-plan.md` 为准。

**仓库里有两个入口**：根 `index.html`（单文件原型，v0.6 冻结）与 `web/`（工程化 React 版，v0.7 起）。两者同源、同 IndexedDB 库、同 localStorage 键，互相读得懂对方的数据。

## 铁律（违反即返工）

1. **`index.html` 是单文件应用**：无构建、无框架、无外部 CDN 依赖。不要引入打包器、npm 依赖或拆分模块，除非用户明确要求。

   **例外（用户于 v0.7 明确要求，已生效）**：
   - 根 `index.html` 原型**保持不变**，仍然遵守本条约束。
   - `web/` 是**工程化版本**，明确允许构建与依赖（React 19 + TS 严格 + Vite + Tailwind + Zustand，单测 Vitest，依赖清单在 `web/package.json`），允许拆分模块。
   - 两个入口的上线路径：根原型 → `https://tomorrowdolol.github.io/snapsaga-trip-prototype/`；web 版 → `.../web/`（Pages 从 main 分支提供，**没有 CI**，所以 `web/dist/` 必须 commit，`web/.gitignore` 故意不忽略它；以后可以把 Pages 源切成 Actions 再取消提交产物）。
   - **改哪边**：真实功能/算法/队列改 `web/src/**`（有 53 个单测 + 75 项 e2e + 47 项 guard 守着），改完 `npm run verify` → build → 连 `dist` 一起提交；只想让线上原型立刻变一下、不碰构建，才改根 `index.html`（仍然要三同步）。两边都改时先改 `web/`。
   - `web/src/domain/sun.ts` 是根原型太阳算法的逐行搬迁，**改它必须先跑 `npm test`（等价性测试会把 index.html 的原实现抽出来逐值比对）**。
2. **本仓库公开**（GitHub Pages 免费版约束）：任何 API Key、凭证、内网地址、个人绝对路径不得入库。用户在原型里填的 Key 只存浏览器 localStorage，与仓库无关。
3. **改 `index.html` 必须三同步**：页头 `TRIP PROTOTYPE vX.Y` 版本号 +1；`docs/iteration-log.md` 顶部追加记录（改动点 / 验证情况 / 已知问题变化）；有新问题登记为新 K 条目。
4. **太阳计算算法已数值验证**（成都/北京/赫尔辛基/三亚，日出日落偏差 <11 分钟，见 iteration-log v0.1）。不许"顺手重构"这段；确需改动，必须用同样方法重新跑四城市数值对比并写进日志。
5. **push 到 main = 直接发布线上**（GitHub Pages，约 1 分钟生效，线上地址见 README）。所以：未经本地验证不许 push；破坏性改动先开分支或问用户。

## 标准改动流程

1. 读 `docs/iteration-log.md`：了解当前版本、已知问题（K 条目）、候选清单。用户的口头反馈常直接对应某个 K 条目。
2. **先判断改哪个入口**（见铁律 1 的例外说明）：
   - 改 `web/`：`npm run verify`（build + test + guard + e2e）全绿 → commit（含 `web/dist`）→ push
   - 改根 `index.html`：版本号 +1 → 本地验证（见下）→ commit → push
3. 本地验证（至少前两项；web 版直接 `npm run build && npm test`）：
   - HTML 结构：解析检查标签闭合（python3 html.parser 即可）
   - JS 语法：提取全部 `<script>` 内容跑 `node --check`
   - 涉及相机 / 水平仪 / 拍立得 / 修图逻辑：真机或浏览器 DevTools 手机模拟过一遍对应路径；相机相关功能注意**必须 HTTPS 环境才能测**，本地用 `localhost` 可绕过
4. 更新 `docs/iteration-log.md`。
5. commit（信息写清改了什么）→ push → 等约 1 分钟 → `curl` 线上 URL 验证 200。
6. 向用户汇报：改动点、验证了什么、线上链接。

## 网络环境

本机访问 GitHub 需走代理：git 已全局配置；但 `gh`、`curl`、`git clone https://` 不一定继承，超时时先查 `git config --global --get https.proxy` 并显式设置 `HTTPS_PROXY` 后重试。

## 技术边界（原型阶段，别越界）

- **已实现**：取景（网格/水平仪/场景卡）、黄金时刻（离线计算）、胶卷（IndexedDB）、拍立得合成与显影、本地滤镜、可选的 AI 直连重绘。现状见 iteration-log v0.1 与 K 条目。
- **已知限制是设计内取舍，不要在原型里"修"**：
  - AI 重绘的 CORS 限制 → 正式版走网关解决（p0-plan 决策 D1），原型保持直连 + 明确报错
  - 场景识别是手动选场景 → 正式版才做 ML Kit 自动识别
- **连续漫画未实现**：属 P1（p0-plan），原型不做占位之外的东西。
- 正式版 Flutter 代码将来落 `app/` 目录；在那之前不要往根目录加构建产物、依赖清单或与原型无关的目录。
- `web/` 是原型阶段的工程化实现（不是正式版）：只允许 `web/` 内出现构建产物与依赖清单，**`web/dist` 要提交**（Pages 无 CI）；根目录依然不放构建产物。

## 文档维护

- `README.md`：面向人的项目总览。目录结构变化、线上链接变化时同步。
- `web/README.md`：工程化版本的目录/命令/数据兼容/部署权衡/未覆盖项；改 `web/` 的流程或结构时同步。
- `docs/iteration-log.md`：面向迭代的唯一事实源。每版必更，格式照现有条目。
- 本文件（AGENTS.md）：流程或铁律变化时更新；改动前先确认用户意图。
