# 迭代日志（当前状态 / 活跃问题 / 版本摘要）

**先读这一份。** 当前状态、还没解决的问题、每版做了什么，都在首屏。
每版的详细验证记录、实测数字表、已解决 K 条目原文在归档里：[`iteration-history.md`](iteration-history.md)。
文档分工见 [`../README.md#文档地图`](../README.md#文档地图)；改完文档跑 `node scripts/check-docs.mjs`。

## 当前状态（2026-09-22 核对）

两个入口**同源同库**（同一个 IndexedDB 库 `snapsaga`、同一批 localStorage 键，互相读得懂对方的数据），
功能与数据兼容细节见 [`../web/README.md`](../web/README.md)。

| 入口 | 版本 | 技术栈 | 线上地址 |
|------|------|--------|----------|
| 根 `index.html` | **v0.6（冻结）** | 单文件 HTML/CSS/JS，无构建、无依赖 | <https://tomorrowdolol.github.io/snapsaga-trip-prototype/> |
| `web/` | **v0.7** | React 19 + TS 严格 + Vite + Tailwind + Zustand | <https://tomorrowdolol.github.io/snapsaga-trip-prototype/web/> |

<!-- check-docs: root-version=v0.6 web-version=v0.7 —— 上面两个版本号由 scripts/check-docs.mjs 与页头比对 -->

- **部署**：Pages 由 GitHub Actions 发布（`build_type: workflow`），推送 `main` 即构建 + 门禁 + 发布。
  站点形状（`assemble-site.mjs`、`/web/` 入口、`dist` 不提交）**只在 [`../README.md#部署形状`](../README.md#部署形状) 写一份**。
- **验证矩阵**（在 `web/` 跑 `npm run verify`）：53 个单测 · 75 项 e2e · 61 项 guard；分层说明见 [`../web/README.md`](../web/README.md)。
- **产品与路线真源**：功能定义 [`design-v0.1.html`](design-v0.1.html)，工程路线 [`p0-plan.md`](p0-plan.md)（本日志不做定义）。

## 活跃已知问题

需要动手的条目（编号是历史锚点：不重排、不复用；已收尾的条目见归档）。

| # | 问题 | 影响 | 计划 |
|---|------|------|------|
| K2 | 长按删除依赖 `contextmenu`，部分安卓浏览器长按弹系统菜单（根原型与 `web/` 实现相同） | 删除入口不稳定 | 胶卷改成「选中后出删除按钮」（两版都还没改） |
| K5 | 照片以原始分辨率存 IndexedDB（真机单张 3.1 MB 级）；v0.6 已加缩略图，但原图上限管理 / LRU 未做 | 存储随张数增长 | 原图上限 + LRU；需要时再给「清理缩略图」（清后自动重建） |
| K8 | 队列快照里带源图 blob（为了让刷新恢复不依赖原片），与胶卷原片在 IndexedDB 里各存一份 | 存储翻倍（仅未完成任务） | 快照只存 `photoId`，恢复时回查 photos 仓 |
| K15 | 切后台/锁屏时页面被挂起（iPhone iOS 26.6 实测：计时器最长 51.5 s 未跳）→ 队列只在页面活跃时推进，「后台生图」实际含义是「不挡拍照」 | 切到相机 App 期间队列暂停；回前台自动补跑 | 已实现回前台续跑；**根治要改成「服务端任务 + 轮询」**（p0-plan 的网关形状），原型不做 |
| K17 | 缩略图是**列表专用的降级图**，点开大图/送去做拍立得/入队生图仍用原图（3 MB 级），这几条路径的耗时未优化 | 打开大图、生图上传的等待时间不变 | 大图已 `decoding="async"`；后续加大图 loading 占位与进度反馈 |
| K18 | 缩略图额外占存储（实测约 30 KB/张，相对原图约 3%）；本版之前的照片首次打开会触发一次性后台回填 | 存储略增；首次打开有后台解码活动 | 可接受；需要时在设置里提供「清理缩略图」 |
| K20 | 有**两套实现**（根 `index.html` 与 `web/`），同一功能改两边会漂移；只有太阳算法有数值等价性测试守着 | 一边的改动不会自动出现在另一边 | 功能演进只改 `web/`（有测试 + guard），根原型冻结；必须两边同改时先改 `web/` 再同步并跑 `npm run verify` |
| K21 | 旧验收脚本（`snapsaga_queue_check/*.cjs`、`ss_e2e.cjs`）依赖页面全局（`PHOTOS`/`DB`/`GenQueue`/`cam`…），靠 `src/debug/bridge.ts` 只读兼容层才能跑 | 删掉 bridge 会让那批脚本失效（`web/e2e/` 已内化同样断言，不受影响） | 保留 bridge（零成本、便于线上排查）；新验收一律写在 `web/e2e/` |
| K22 | e2e 里相机仍是 canvas 流 + `ImageCapture` stub；真机 `takePhoto` 的分辨率提升、iPhone 真实能力清单都不在 CI 覆盖内（延续已归档的 K12/K13/K14） | 真机行为仍可能与本机不一致（历史教训：v0.4 曾误判 iOS 不支持 takePhoto） | 出游实测时用 `tools/ios-probe.html` + 取景信息条（显示实际分辨率与本次是静止图像还是抓帧）复测 |
| K23 | **PWA 的 SW scope 是 `/web/dist/`**（sw.js 就在产物目录里）：安装到主屏后的 `start_url` 落在 scope 内、离线可用；而 `/web/` 入口页本身不受 SW 控制（离线刷新 `/web/` 会失败，`/web/dist/app.html` 正常） | 离线只覆盖产物目录 | 要连 `/web/` 一起离线需把 sw.js 放到 `web/` 根（再拆一层构建步骤）；当前安装路径已满足离线需求 |

## 设计内取舍

已知、但**不在原型里修**的条目（正式版或平台层面解决）。

| # | 问题 | 影响 | 为什么这样定 |
|---|------|------|--------------|
| K3 | AI 直连受目标服务 CORS 限制（OpenAI 官方端点可用、部分兼容网关不行） | 部分 Key 无法体验 AI 重绘 | 设计内取舍：正式版走自建网关（p0-plan 决策 D1）；原型保持浏览器直连 + 明确报错 |
| K6 | 场景识别是手动选场景 | 引导体验打折 | 设计内取舍：正式版才做 ML Kit 自动识别 |
| K9 | 生成中刷新页面 → 该任务重新排队，服务端可能已经出了一张图，属于重复生成（多花钱） | 极端情况多花一次生图费用 | 已接受：正式版用内容 hash 做幂等键（p0-plan A4）；原型接受 |
| K10 | 大量快速重渲染时，被提前 revoke 的缩略图会产生 `net::ERR_FILE_NOT_FOUND` 控制台噪声（实测 0 次元素仍在 DOM 的加载失败，纯噪声） | 仅控制台噪声 | 已接受：若以后觉得吵，改成延迟 ~1s 回收旧批次 |
| K11 | 用户显式保存过自定义 Base 时不会被覆盖（含自建网关）；保存值**恰好等于旧默认** `https://api.openai.com/v1` 的浏览器会被切到新默认（无法区分「随手沿用默认」与「手打 openai」） | 想故意继续用 openai 官方地址的人需在设置里重填一次 | 预期行为（不覆盖用户显式配置）；若需要统一，后续加「重置为默认」按钮 |
| K16 | 浏览器标签页下 iOS 不支持 Notification / Web Push（需先「加到主屏」为 standalone 才可能出现）；屏幕方向锁定、震动 iOS 一直不提供 | 想推送提醒/锁屏体验会失望 | 平台事实；需要时先把页面加到主屏再复测（`tools/ios-probe.html` 可直接重跑）；推送不是当前必需 |

已解决 / 已过期 / 已缓解的条目（K1、K4、K7、K12、K13、K14、K19）原文见
[`iteration-history.md` 的 K 条目存档](iteration-history.md#k-条目存档)。

## 版本摘要
详细验证记录与数据表在 [`iteration-history.md`](iteration-history.md)（每版一节）。

### v0.7 · 工程化迁移（React 19 + TS + Vite）— 2026-09-22
- 做：`web/` 工程化版**逐项对齐**原型 10 项功能（不新增）；太阳算法逐行等价搬迁 + 四城市等价性测试；旧验收脚本搬成真测试（Vitest/e2e）+ `npm run guard` 红线（含产物运行时与子路径部署冒烟）。
- 数字：生图接口挂死时快门仍 **0.6–0.9 ms** 返回；6 连拍并发峰值 **4**；产物 JS 269.1 KB（gzip 86.4 KB）。
- 验：53 单测 / 75 e2e / 61 guard 全绿；`git diff --stat main -- index.html` 无改动（根原型仍 v0.6）。遗留：K22 / K23。

### v0.6 · 缩略图 + 增量渲染 — 2026-09-22
- 做：缩略图（最长边 320 / jpeg .72，**不进快门 await 链**）+ 胶卷/AI 相册增量渲染 + 老记录后台回填。
- 数字：原图 **1356.2 KB → 30.3 KB（44.7×）**；快门延迟 85/93/87 ms 未被拖慢；老记录 1293 KB → 31 KB。
- 验：缩略图专项 13 项、队列 18 项、拍照三环境、e2e 全 PASS。遗留：新增 K17 / K18。

### v0.5 · 真机实测回归 — 2026-09-22
- 做：用 `tools/ios-probe.html` 在 **iPhone iOS 26.6** 实测；`camTune()` 改为按 `getCapabilities()` 下约束（iPhone 没有 `focusMode`）；`init()` 主动申请 `navigator.storage.persist()`。
- 数字：`takePhoto` **存在且成功**（推翻 v0.4 假设）；后摄真拍 3 106 140 B vs 抓帧 554 689 B（≈**5.6×**）；前摄 3 809 768 B vs 1 180 675 B；预览 1440×2560；**切后台计时器最长 51.5 s 未跳**；配额 9830 MB。
- 验：按能力下约束 / 拍照三环境 / 队列 18 项 / `tools/check_gen_queue.mjs` / e2e 全 PASS。遗留：更正 K12；新增 K15 / K16。

### v0.4 · 真拍照（静止图像优先，失败回落抓帧）— 2026-09-22
- 做：`grabStill()` 优先 `ImageCapture.takePhoto()`、不支持或抛错则一次性回落抓帧；取景信息条 `#camMeta` 如实显示「静止图像 / 抓帧」与实际分辨率；照片新增 `shot` 字段；新增真机探测页 `tools/ios-probe.html`。
- 数字：`takePhoto` 故意拖 300 ms 时快门 **35 ms** 返回；拍照三环境专项 15 项 PASS。
- 验：队列 18 项、`tools/check_gen_queue.mjs`、e2e 全 PASS。遗留：新增 K12 / K13 / K14；当时**真机相机路径未实测**（本机无摄像头）→ v0.5 用 iPhone 补上。

### v0.3 · 生图默认 Base 指向 api.klong.lat — 2026-09-22
- 做：新增 `AI_BASE_DEFAULT = https://api.klong.lat/v1` 与 `aiBaseSetting()`（默认值只在一处定义，设置框与生图请求共用）→ **只填 Key 就能生图**；旧默认 `api.openai.com/v1` 留作 `AI_BASE_LEGACY` 专门识别「随手沿用」。
- 验：HTML/JS、队列 18 项、`tools/check_gen_queue.mjs` 41 项；Playwright 断言清空 localStorage 后 `aiCreds().base` 与设置框预填值都是新默认（PASS）。
- 遗留：新增 K11；未用真实 Key 打通 `api.klong.lat`（无凭证），CORS 行为未知（K3）。

### v0.2 · 生图队列（拍照不等生成）— 2026-09-22
- 做：生图拆成后台队列——快门路径无 AI 调用/await；`aiRedrawCore()` 成唯一生图通道；并发上限 4 + 严格 FIFO；完成即归档「✨ AI 相册」；失败可重试不卡队列；IndexedDB 升 v2 加 `queue` 仓支持刷新续跑；批次化 objectURL 回收。
- 数字：快门 **0.6 ms** 返回；6 连拍 → 4 生成中 + 2 排队 + 徽标 6；并发峰值 **4**；刷新后 3 条续跑并归档；重渲染 12 轮后活跃 objectURL 33（created 682 / revoked 649，不增长）。
- 验：队列 18 项、`tools/check_gen_queue.mjs` 41 项、Playwright 端到端（含失败重试）全 PASS。遗留：登记 K1–K18（K1–K7 首次登记于 v0.1，本版补 K8–K10）。

### v0.1 · 出行原型 — 2026-09-22
- 做：首版原型——取景（前后摄/网格/水平仪/8 场景卡/快门闪白）、黄金时刻（本地天文计算）、胶卷（IndexedDB）、拍立得工坊（3 种胶片 + 颗粒 + 日期戳 + 手写注记 + 10 秒显影 + 分享保存）、5 个本地滤镜 + 可选 AI 直连重绘、设置页。
- 数字：**太阳算法四城市实测（成都/北京/赫尔辛基/三亚）日出日落偏差 <11 分钟**（铁律 4 的来源）。
- 验：HTML 结构校验 + JS `node --check` 通过；GitHub Pages HTTPS 200。遗留：首次登记 K1–K7。

## 下一版候选（唯一一份）

1. 出游实测反馈修复（真实手机 + 真实 Key 跑一轮生图队列）
2. K5 / K8：缩略图与原图上限管理，队列快照只存 `photoId`
3. 胶卷多选 → 批量入队生图（一次挑 5 张排队）+ 队列手动暂停/继续
4. K23：让 `/web/` 入口页也进 SW scope（离线刷新 `/web/` 可用）
5. 生图风格 prompt 模板抽成可编辑（为 p0-plan D1 的 prompt 模板引擎收集调参数据）

## 文档整理记录

**2026-09-22 · 文档整理（纯文档改动，未碰代码 / 产物 / 版本号）**

- `iteration-log.md` 384 行 → 本结构（当前状态 + 活跃问题 + 版本摘要），每版明细迁往新建的 [`iteration-history.md`](iteration-history.md)（含 v0.1–v0.7 验证记录、实测数字表、已解决 K 条目原文）。
- 两处 K 表重复（v0.1 表与 v0.2 大表里的 K1–K7 行）合并：**同一编号现在全仓库只有一处定义**；部署形状收敛为单一真源 [`../README.md#部署形状`](../README.md#部署形状)（原散在 `README.md`、`web/README.md`、本文件）。
- 新增 `scripts/check-docs.mjs`（内部链接 / K 编号唯一且连续 / 首屏与归档分工 / 文档地图 / 版本号与页头一致），已接进 `.github/workflows/deploy-pages.yml` 的 build job。
- 迁移映射：K1、K4、K7、K12、K13、K14、K19 → history 的「K 条目存档」；K2、K3、K5、K6、K8–K11、K15–K18、K20–K23 → 留在本文件；v0.1–v0.7 的验证表与实测数字 → history 对应小节；`web/README.md` 的「dist 要提交」权衡段 → history v0.7 与 K19 行（现行为 `dist` 不提交）。
- 顺带更正了三处**与当前仓库状态不符的陈述**（K19 已解决后的残留）：`AGENTS.md` / `web/README.md` / `README.md` 里「Pages 从分支提供、没有 CI，所以 `web/dist` 必须提交」——现为「Actions 发布、`dist` 不提交」。铁律的实质语义未改。

---

> 迭代约定：改动 `index.html` 必须同步更新本日志（版本号 + 一行摘要）；详细记录追加到 `iteration-history.md`。
> 版本号在页头 `TRIP PROTOTYPE vX.Y` 同步修改。改完文档跑 `node scripts/check-docs.mjs`。
