# AGENTS.md — AI 代理工作指南

任何 AI 代理（Codex / Claude Code / Pi 等）在本仓库干活前，**先完整读完本文件再动手**。

## 项目一句话

「拾光 SnapSaga」：旅拍创作 App。当前阶段 = 网页出行原型（`index.html`，单文件）+ 设计文档；Flutter 正式版尚未开工。产品功能定义以 `docs/design-v0.1.html` 为准，工程路线以 `docs/p0-plan.md` 为准。

## 铁律（违反即返工）

1. **`index.html` 是单文件应用**：无构建、无框架、无外部 CDN 依赖。不要引入打包器、npm 依赖或拆分模块，除非用户明确要求。
2. **本仓库公开**（GitHub Pages 免费版约束）：任何 API Key、凭证、内网地址、个人绝对路径不得入库。用户在原型里填的 Key 只存浏览器 localStorage，与仓库无关。
3. **改 `index.html` 必须三同步**：页头 `TRIP PROTOTYPE vX.Y` 版本号 +1；`docs/iteration-log.md` 顶部追加记录（改动点 / 验证情况 / 已知问题变化）；有新问题登记为新 K 条目。
4. **太阳计算算法已数值验证**（成都/北京/赫尔辛基/三亚，日出日落偏差 <11 分钟，见 iteration-log v0.1）。不许"顺手重构"这段；确需改动，必须用同样方法重新跑四城市数值对比并写进日志。
5. **push 到 main = 直接发布线上**（GitHub Pages，约 1 分钟生效，线上地址见 README）。所以：未经本地验证不许 push；破坏性改动先开分支或问用户。

## 标准改动流程

1. 读 `docs/iteration-log.md`：了解当前版本、已知问题（K 条目）、v0.2 候选清单。用户的口头反馈常直接对应某个 K 条目。
2. 改 `index.html`，版本号 +1。
3. 本地验证（至少前两项）：
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

## 文档维护

- `README.md`：面向人的项目总览。目录结构变化、线上链接变化时同步。
- `docs/iteration-log.md`：面向迭代的唯一事实源。每版必更，格式照现有条目。
- 本文件（AGENTS.md）：流程或铁律变化时更新；改动前先确认用户意图。
