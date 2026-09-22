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
   - 两个入口的上线路径：根原型 → `https://tomorrowdolol.github.io/snapsaga-trip-prototype/`；web 版 → `.../web/`。**部署形状（Actions 管线 / `scripts/assemble-site.mjs` / `/web/` 入口 / `web/dist` 不提交）只在 [README 部署形状](README.md#部署形状) 写一份**——改部署先改那里，别在这里另写一套。
   - ⚠️ `web/index.html` 是 `npm run build` 生成的入口页（Pages 的 `/web/` 只会找 index.html），**不要手改**；Vite 源入口是 `web/app.html`，改界面改它。改完必须 `npm run build` 把它重新生成。
   - **改哪边**：真实功能/算法/队列/主题改 `web/src/**`（有 149 个单测 + 139 项 e2e + 93 项 guard 守着），改完 `npm run verify` 全绿即可（`web/dist` 由 CI 构建，不提交）；只想让线上原型立刻变一下、不碰构建，才改根 `index.html`（仍然要三同步）。两边都改时先改 `web/`。
   - `web/src/domain/sun.ts` 是根原型太阳算法的逐行搬迁，**改它必须先跑 `npm test`（等价性测试会把 index.html 的原实现抽出来逐值比对）**。
2. **本仓库公开**（GitHub Pages 免费版约束）：任何 API Key、凭证、内网地址、个人绝对路径不得入库。用户在原型里填的 Key 只存浏览器 localStorage，与仓库无关。
3. **改 `index.html` 必须三同步**：页头 `TRIP PROTOTYPE vX.Y` 版本号 +1；`docs/iteration-log.md` 顶部追加记录（改动点 / 验证情况 / 已知问题变化）；有新问题登记为新 K 条目。
4. **太阳计算算法已数值验证**（成都/北京/赫尔辛基/三亚，日出日落偏差 <11 分钟，原始记录见 `docs/iteration-history.md` v0.1，摘要见 `docs/iteration-log.md` v0.1）。不许"顺手重构"这段；确需改动，必须用同样方法重新跑四城市数值对比并写进日志。
5. **push 到 main = 直接发布线上**（GitHub Pages，推送后 CI 构建 + 门禁 + 发布，约 1–2 分钟生效，线上地址见 README）。所以：未经本地验证不许 push；破坏性改动先开分支或问用户。

## 标准改动流程

1. 读 `docs/iteration-log.md`：了解当前版本、**活跃已知问题（K 条目）**、设计内取舍与候选清单。用户的口头反馈常直接对应某个 K 条目；要查历史细节（实测数字、已解决条目原文）读 `docs/iteration-history.md`。
2. **先判断改哪个入口**（见铁律 1 的例外说明）：
   - 改 `web/`：`npm run verify`（build + test + guard + e2e）全绿 → commit（`web/dist` 不提交，CI 会构建）→ push
   - 改根 `index.html`：版本号 +1 → 本地验证（见下）→ commit → push
3. 本地验证（至少前两项；web 版直接 `npm run build && npm test`）：
   - HTML 结构：解析检查标签闭合（python3 html.parser 即可）
   - JS 语法：提取全部 `<script>` 内容跑 `node --check`
   - 涉及相机 / 水平仪 / 拍立得 / 修图逻辑：真机或浏览器 DevTools 手机模拟过一遍对应路径；相机相关功能注意**必须 HTTPS 环境才能测**，本地用 `localhost` 可绕过
4. 更新文档：`docs/iteration-log.md` 写版本摘要与活跃问题变化，详细记录追加到 `docs/iteration-history.md`；**改完文档跑 `node scripts/check-docs.mjs`**（CI 也会跑同一道检查）。
5. commit（信息写清改了什么）→ push → 等 CI 跑完（约 1–2 分钟）→ `curl` 线上 URL 验证 200。
6. 向用户汇报：改动点、验证了什么、线上链接。

## 网络环境

本机访问 GitHub 需走代理：git 已全局配置；但 `gh`、`curl`、`git clone https://` 不一定继承，超时时先查 `git config --global --get https.proxy` 并显式设置 `HTTPS_PROXY` 后重试。

## 技术边界（原型阶段，别越界）

- **已实现**：取景（网格/水平仪/场景卡）、黄金时刻（离线计算）、胶卷（IndexedDB）、拍立得合成与显影、本地滤镜、可选的 AI 直连重绘。现状见 `docs/iteration-log.md` 与 K 条目。
- **已知限制是设计内取舍，不要在原型里"修"**：
  - AI 重绘的 CORS 限制 → 正式版走网关解决（p0-plan 决策 D1），原型保持直连 + 明确报错
  - 场景识别是手动选场景 → 正式版才做 ML Kit 自动识别
- **连续漫画未实现**：属 P1（p0-plan），原型不做占位之外的东西。
- 正式版 Flutter 代码将来落 `app/` 目录；在那之前不要往根目录加构建产物、依赖清单或与原型无关的目录。
- `web/` 是原型阶段的工程化实现（不是正式版）：只允许 `web/` 内出现构建产物与依赖清单（`web/dist` 由 CI 构建、**不提交**，见 [README 部署形状](README.md#部署形状)）；根目录依然不放构建产物。

## 文档维护

分工（**一份内容只写一处**，别处只留一句 + 链接）：

- `docs/iteration-log.md`：**首屏 / 面向迭代的唯一入口**——当前状态（版本、入口、验证矩阵）、活跃已知问题、设计内取舍、每版 4–5 行摘要、下一版候选。每版必更。
- `docs/iteration-history.md`：**归档**——v0.1–v0.7 的详细验证记录、实测数据表、已解决 K 条目原文。只在需要查证历史事实时追加，不往前搬。
- `README.md`：面向人的总览 + **部署形状的单一真源** + 文档地图（新增文档必须登记）。目录结构、线上链接、部署形状变化时同步。
- `web/README.md`：工程化版专属——目录/命令/数据兼容/验证矩阵/未覆盖项；部署只留一句 + 链接。改 `web/` 的流程或结构时同步。
- `scripts/check-docs.mjs`：文档防腐烂检查（内部链接、K 编号唯一且连续、首屏与归档分工、文档地图、版本号与页头一致），跑在 CI 的 build job 里。
- 本文件（AGENTS.md）：流程或铁律变化时更新；改动前先确认用户意图。

**K 条目规则**：编号是历史锚点，不重排、不复用；每个编号在**整个仓库只能有一处表格定义**（活跃问题表、设计内取舍表或归档存档表三选一），已解决的条目必须从活跃表移走，只留编号引用。
