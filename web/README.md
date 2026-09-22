# 拾光 SnapSaga · web/（工程化版本）

根目录的 `index.html` 是**单文件原型**（v0.6，仍然是当前线上入口之一）。这里是**功能演进主线**：
React 19 + TypeScript（严格模式）+ Vite + Tailwind + Zustand，带真单测、真 e2e 与红线 guard。

v0.8 起 `web/` 以「**主题模式**」为中心（视觉与信息架构以主题模式设计稿为准：深底 + 琥珀金、
六个 tab：取景·主题·胶卷·暗房·相册·设置）：

- **主题是一等公民**：写一句提示词（5 组 32 词拼装 + 实时预览 + 质量提示）→ 选 2–9 张图 → 两种产出
  （**合成一张** N→1 / **统一风格** N→N）；主题可复用提示词、可「再来一版」、可**边拍边收**。
- **边拍边收**：启用主题后取景页顶部出现主题条，每按一次快门就把照片同步收进主题并立刻入队重绘；
  **快门路径依然不 await 任何 AI / 网络**。
- **并发 9 / 多图 9 / 一个主题任务只占 1 个槽位**（槽位显示 `k/n` 分张进度）。

v0.9 起**取景（拍照）页是干净相机界面**：

- **取景画面占满**（`#camWrap` 不再设最小高度、`#view-cam` 不滚动），页面与视图都不需要滚动；
- **固定底栏**：一行最近拍摄（最多 6 + ＋）+ 一行 `[📷相机][大快门][🔄翻转]`，快门在任何支持的高度下
  都完整可见且不被任何元素覆盖；
- **辅助 UI 全在相机抽屉 `#camSheet`**：场景相机 8 台 / 焦距档 13–50 / 胶片与风格 chips / 黄金时刻 /
  曝光补偿·闪光·定时·水平仪 / `#camMeta` 诊断信息。点 dock 相机按钮或左下角小字打开，点遮罩 /
  下拉手势 / 再点一次关闭；抽屉只盖取景画面（挂在 `#camWrap` 里），**快门行永远露在外面**；
- 取景页隐藏 AppHeader，入口改由取景器右上角半透明小圆钮（▦网格 / ≡水平仪 / ✨队列 / ⚙设置）接管；
  取景器内只留轻量浮层（35mm 框 / AF 框 / 网格 / 水平仪 / 直方图 / 太阳弧 / 曝光刻度），
  构图提示是**单行 + 3.5 s 自动淡出 + 点一下再显示**。

> 铁律仍然成立：**根 `index.html` 一行都不改**。两个入口同源、同库、同 localStorage 键，互相读得懂对方的数据。

## 线上地址

- 工程化版本：<https://tomorrowdolol.github.io/snapsaga-trip-prototype/web/>
- 单文件原型：<https://tomorrowdolol.github.io/snapsaga-trip-prototype/>

Vite 必须 `base: './'`：线上是 `/snapsaga-trip-prototype/web/` 子路径，绝对路径会让 `/assets/*.js` 404。

## 目录结构

```
web/
├── app.html                   # Vite 源入口（只有 #root 与 <script type=module>）；故意不叫 index.html
├── index.html                 # 构建生成的入口页（引用 ./dist/ 产物）——Pages 的 /web/ 就是它，要提交、不要手改
├── dist/                      # 构建产物（**不提交**：CI 构建后上传）
├── package.json               # 依赖与命令（dev / build / test / guard / e2e / verify）
├── vite.config.ts             # base './' + react + tailwind + vitest(jsdom)
├── tsconfig.json              # 严格模式，零错误才允许 build
├── public/                    # 原样拷进 dist：sw.js / manifest.webmanifest / 图标（svg + png）
├── src/
│   ├── main.tsx               # 挂载 + 调试桥 + 注册 Service Worker
│   ├── App.tsx                # 七个视图都保持挂载（相机流与已解码网格不该被切页销毁）
│   ├── styles.css             # 视觉层：v0.8 起以主题模式设计稿为准（深底 + 琥珀金 + 等宽数字）
│   ├── domain/                # 纯逻辑（可单测，不依赖 React）
│   │   ├── sun.ts             # 太阳算法（逐行等价搬迁，见下）
│   │   ├── genQueue.ts        # 生图队列调度引擎（QUEUE_MAX=9 / 主题任务只占 1 槽位 / 依赖注入）
│   │   ├── themes.ts          # 主题数据模型 + 状态机 + 多图上限 9（纯逻辑）
│   │   ├── promptBuilder.ts   # 提示词词库（5 组 32 词）+ 拼装 + 质量提示
│   │   ├── collage.ts         # 合成一张：布局几何（网格/无缝/故事板）+ canvas 拼图
│   │   ├── sceneArt.ts        # 8 张场景插画 + 相机机身 + 胶卷盒（内联 SVG，逐值搬迁自设计稿）
│   │   ├── capture.ts         # 静止图像优先 + 一次性抓帧回落 + 按能力下约束
│   │   ├── thumbs.ts          # 缩略图（最长边 320 / jpeg .72）
│   │   ├── settings.ts        # localStorage 键名 + AI Base 取值逻辑
│   │   ├── aiRedraw.ts        # 唯一 AI 通道（aiRedrawCore）；主题任务也走它（提示词伪装成 EditStyle）
│   │   ├── polaroid.ts        # 拍立得合成
│   │   ├── editFilter.ts      # 本地滤镜（离线可用）
│   │   ├── presets.ts         # 5 个风格 + 3 种胶片 + 注记文案
│   │   ├── scenes.ts          # 8 个场景卡与构图提示（网格模式含「关」）
│   │   ├── media.ts           # blob↔image / 保存分享
│   │   └── types.ts           # PhotoRec / QueueTask / ThemeRec（老字段不变，只增可选字段）
│   ├── data/db.ts             # IndexedDB：库名 snapsaga，仓 photos / queue（版本 2，只增不清）
│   ├── data/themesDb.ts       # 主题独立库 snapsaga_themes（v1）：不升 snapsaga 版本，见「数据兼容」
│   ├── store/                 # Zustand：useAppStore（含主题 slice）+ 相机运行时 + 队列单例
│   ├── hooks/useObjectUrl.ts  # blob → objectURL，卸载即回收
│   ├── components/            # 视图与面板（id/类名与原型对齐，旧验收脚本可直接跑）
│   │   └── CameraSheet.tsx    # 取景页的相机抽屉（v0.9：辅助 UI 全在里面，只盖取景画面不挡快门）
│   ├── debug/bridge.ts        # window.__snapsaga + 兼容旧脚本的全局名（只读）
│   └── test/                  # Vitest（jsdom）单测
├── e2e/                       # Playwright 验收脚本（跑 dist 产物）；artifacts/ 是截图输出（不入库）
├── scripts/                   # guard.mjs（红线）/ publish-entry.mjs（生成 index.html）/ make-icons.mjs
└── tools/                     # 零依赖：playwright 解析 + 静态服务器
```

## 命令

```bash
npm install
npm run dev        # 本地开发（localhost 可绕过 HTTPS 限制测相机）
npm run build      # tsc --noEmit && vite build && 生成 web/index.html（TS 严格模式零错误才通过）
npm test           # Vitest + jsdom：队列调度 / 主题模型 / 提示词 / 拼图 / 场景插画 / 缩略图 / AI Base / 太阳算法 / 相机取图
npm run guard      # 红线断言：源码侧 + 构建产物侧 + 产物运行时（真 Chromium 加载 dist）
npm run e2e        # Playwright 六组验收（需要先 build）
npm run verify     # build → test → guard → e2e 一条龙
```

`playwright` **不在 dependencies 里**（浏览器包很大）：`tools/playwright.mjs` 会先找本地
`node_modules`，再找全局安装。没有就跳过 guard 的运行时断言、e2e 直接报错。

## 数据兼容（重要）

新应用与根原型**同源**，用户现有数据必须能直接复用：

| 项目 | 值 |
|------|-----|
| IndexedDB（照片/队列） | 库名 `snapsaga`；仓 `photos`(keyPath `id`) 与 `queue`(keyPath `id`)，**版本仍是 2** |
| IndexedDB（主题） | 库名 `snapsaga_themes`；仓 `themes`(keyPath `id`)，版本 1（v0.8 新增，只存 id 引用、不存 blob） |
| 照片记录 | `{id, blob, ts, shot, thumb?, kind?, from?, style?, styleName?, theme?, themeName?, merge?, ids?, layout?}` |
| localStorage | `ss_ai_base` / `ss_ai_key` / `ss_ai_model` / `ss_gen_auto` / `ss_gen_style` / `snapsaga_geo` |
| AI 默认 Base | `https://api.klong.lat/v1`（未填过或等于旧默认 `https://api.openai.com/v1` 时用它；显式填过的自定义值尊重，去尾部斜杠） |

**为什么主题不放进 `snapsaga` 库**：根原型用 `indexedDB.open('snapsaga', 2)` 打开，而浏览器里一个库
一旦升到更高版本，再用**更低版本**打开会直接抛 `VersionError` —— 只要我们把 `snapsaga` 升到 v3 加一个
`themes` 仓，冻结的根原型（v0.6）就再也读不到用户数据了。「两个入口同源同库、互相读得懂」是铁律，
所以主题另开一个独立库；照片本体仍然全在 `snapsaga` 里，两边都读得到。

表结构升级只允许**新增版本 + 兼容迁移**，不许清库。老记录没有 `thumb` 字段时会在启动后
逐张后台回填（一次一张、让出主线程），补好即落库。`PhotoRec` 在 v0.8 只新增**可选**字段，
老版本读到会忽略（不会因为多字段而读不懂）。

## 部署要点（详见根 README）

> 部署形状的**单一真源是 [根 README 的「部署形状」](../README.md#部署形状)**（管线、站点形状表、本地复现、踩过的坑）。
> 这里只留 `web/` 自己的三条：

- Pages 由 **GitHub Actions** 发布，推送 `main` 即构建 + 门禁（test / build / guard）后上传
  `scripts/assemble-site.mjs` 组装出的 `_site/`；**`web/dist` 不提交**（`.gitignore` 已忽略，由 CI 构建）。
- `web/index.html` 是 `npm run build` **生成**的入口页（把引用改写成 `./dist/…`），`…/web/` 就是它——
  **要提交、不要手改**；改界面改 `web/app.html`。
- 三个入口都能打开应用：`/web/`（分享链接）、`/web/dist/`（**PWA start_url 落点，iOS 添加到主屏后打开的就是它**）、`/web/dist/app.html`。
  `dist/index.html` 由构建生成（`scripts/publish-entry.mjs`）——缺了它，安装到主屏后点图标会 404。
  Service Worker 的路径由页面里的 `<link rel=manifest>` 反推（`sw.js` 在 manifest 旁边），三种入口都能拿到正确 scope。

为什么源入口不叫 `index.html`：Pages 请求目录只会找 `index.html`，而 Vite 源入口若也叫这个名字，
构建产物会盖掉它（第一次上线时 `…/web/` 返回 200 但资源全 404，就是这么来的）。

## 验证矩阵（`npm run verify`）

| 层 | 工具 | 数量 | 说明 |
|----|------|------|------|
| 单测 | Vitest + jsdom | **149** 个测试（10 个文件） | 队列调度（并发峰值 9 / 主题任务占 1 槽位 / FIFO / 失败隔离重试 / 归档 / 刷新恢复）9 · 主题模型（状态机 / 两条上限 9 / 产出条数）22 · 提示词拼装 14 · 拼图布局与合成 27 · 场景插画 18 · 缩略图 14 · 相机取图 16 · AI Base 11 · 太阳算法等价性 3 |
| 验收 e2e | Playwright（真 Chromium + 真 IndexedDB，只 stub 相机与生图接口） | **206** 项 | 主链路 36（并发 9）/ **主题模式 63** / **取景页几何与相机抽屉 67（v0.9 新）** / 缩略图与增量 13 / 拍照三环境与能力约束 17 / AI 默认 Base 10 |
| 红线 guard | node + Playwright | **112** 项 | 源码侧 68 / 产物侧 25 / 产物运行时 12 / 子路径部署冒烟 7 |
| 构建 | tsc（严格）+ vite | — | `npm run build` 零错误 |

主题模式专项 e2e（`e2e/acceptance-theme-mode.e2e.mjs`，63 项）四个场景：

1. **创建主题（词库拼装）→ 合成一张 → 相册出现 1 张**：点选词 → 预览/质量提示 → 选 3 张 → 队列 1 条
   主题任务（`n=3`）→ 槽位 `0/3 → 3/3` → 产出 1 张、AI 只调 1 次（拼图在本地）。
2. **统一风格 + 边拍边收 → 连拍 3 张**：主题条出现 → 快门同步返回 0.6 ms → 主题收 3 张、队列 3 个
   `n=1` 子任务、产出 3 张 → 结束主题 `ended` + 跳暗房 → 「继续边拍边收」追加第 4 张（素材 4 / 产出 4）。
3. **选满 9 张后第 10 张被拒**：全选只选到 9 张 → 点第 10 张 → toast 提示「多图上限 9 张」且选图集合不变 →
   取消一张后可以继续选。
4. **并发峰值 9 / 第 10 个任务排队**：10 连拍 → 9 在跑 + 1 排队 + 峰值 9；暗房 9 个显影槽全忙、统计与徽标一致。

取景页几何专项 e2e（`e2e/acceptance-camera-layout.e2e.mjs`，67 项，**在 390×844 与 390×664 两个视口下各跑一遍**）：

1. **几何**：快门 boundingBox 完整落在视口内且与任何其它可见元素不相交（逐个比较同页元素，排除祖先/后代，
   用「被 overflow 裁剪后的可见矩形」比较）；取景画面高度 ≥ 视口 × 0.6 且被 `object-fit:cover` 的 video 填满；
   `#view-cam` 与 `documentElement` 的 `scrollHeight == clientHeight`（不需要滚动）。
2. **抽屉关闭时取景画面里没有常驻辅助块**：`#sunBar` / `.hs#skins` / `.fs#fr2` / `#genBar` / `#camMeta`
   矩形均为 0（在 `display:none` 的抽屉里），`#camSheet` 是 `display:none`。
3. **抽屉交互**：相机按钮 / 左下角小字打开，点遮罩、下拉手势（真鼠标拖拽把手）、再点一次都能关闭；
   抽屉底边 ≤ 底栏顶边（结构上盖不到快门）；**抽屉开着时真的按一下快门**（照片入库、`#camMeta` 语义不变）；
   抽屉里的控件真能用（切 50 mm → 预览缩放 + 左下角小字跟着变、切场景相机、胶片 chips 存在）。
4. **轻量浮层**：构图提示是绝对定位浮层 + 单行（≤ 32 px）+ 4 s 内 opacity → 0 + 点取景画面恢复；
   取景页 AppHeader 隐藏但 `header .sub` 版本号仍可读、六个 tab 不变；**连 toast 也不压快门**
   （取景页 toast 抬到底栏之上，真触发一次再跑一遍重叠检查）。

截图（人工确认「画面干净、快门明显、构图无遮挡」，产物不入库）：`e2e/artifacts/camera-<视口>-sheet-<closed|open>.png`。

e2e 与 guard 的断言来自根原型的验收脚本（`../snapsaga_queue_check/*.cjs` 与 `ss_e2e.cjs`），
**断言逐条保留、未放松**。两处必要适配（都是"换了实现方式"，不是放宽）：

1. **objectURL 回收**：原型用「批次换 URL」，所以 `revoke ≈ create`；React 版把 URL 生命周期绑到
   元素上（挂载期间复用、卸载才 revoke），所以那条比例断言换成两条更强的不变量：
   「反复重渲染 created 增量为 0」+「删除一张图 → 该元素卸载且其 URL 被 revoke，活跃数不增长」。
2. **openai 常量出现次数**：原型源码内联在 HTML 里，React 版在构建产物 JS 里，所以那条断言改成
   「页面 HTML 里 0 处 + 产物里恰好 1 处」。
3. **并发上限 4 → 9**（v0.8，按设计稿）：主链路的连拍数从 6 提到 10（10 张才观察得到「9 在跑 + 1 排队」），
   徽标断言从「6」改成「9+」（徽标本来就按设计稿封顶到 9+，待处理数量的真值改由队列断言）。
4. **活跃 objectURL 阈值**：从写死的 `≤ 60` 换成更强的**不变量**「活跃 URL ≤ 当前挂载的 `blob:` 图片元素数 + 5」
   —— 界面同时挂载的图变多了（胶片条 + 相册 + 显影槽 + 底部胶片条），写死数字会误报。

## 未覆盖 / 已知限制

- **真机相机路径仍未在 CI 里跑**：e2e 用 canvas 流 + ImageCapture stub，覆盖了三环境与降级逻辑，
  但真机 `takePhoto` 的分辨率提升只能靠 `../tools/ios-probe.html` 在手机上实测
  （这条由 iteration-log 的 **K22** 跟踪；K12/K13/K14 的真机结论见
  [iteration-history 的 K 条目存档](../docs/iteration-history.md#k-条目存档)）。
- **取景页的几何只在 Chromium + 390×844 / 390×664 两个视口下量过**：真机 Safari 带工具栏时可视高度更矮，
  且 `env(safe-area-inset-bottom)` 会让底栏变高、取景画面占比随之略降（仍 > 60%，因为取景画面是 `flex:1`）。
- **构图提示是单行**，窄屏上较长的场景提示会被省略号截断（**K29**）：完整文案在相机抽屉的「场景相机」下方。
- **AI 直连的 CORS 限制不变**（K3）：原型与新应用都是浏览器直连你配置的 Base，正式版走网关。
- 未用真实 Key 打通 `api.klong.lat`（无凭证）。
- 切后台页面被挂起的问题不变（K15）：队列只在页面活跃时推进。
- **主题的「真实出图效果」无法在 CI 里验**（K24）：e2e 只 stub 生图接口（返回 8×8 png），能证明
  「本地拼图 → 单图润色」的链路通、产出张数对、进度与归档对；但「合成一张像不像海报」「统一风格是否
  真统一」取决于模型能力，只能在真机 + 真 Key 下确认。
- **「无缝融合」是启发式**（K26）：客户端拼图不留缝 + 叠柔化渐变，接缝连续性靠 AI 润色兜；
  真无缝要模型侧支持多图入参，开关预留在 `domain/collage.ts` 的 `MULTI_IMAGE_EDITS_SUPPORTED`。
- 设置是**底部抽屉**而不是独立页面（K27）：避免出现两份设置表单（重复 id + 双份维护）。
- PWA 离线缓存是保守策略（导航 network-first、静态资源 stale-while-revalidate）；首次打开仍需网络。
  SW 的 scope 是 `/web/dist/`（sw.js 就在产物目录里），主屏安装后的 `start_url` 正是 `/web/dist/`，
  所以装出来的应用在 scope 内、**离线可启动**；而 `/web/` 入口页本身不在 scope 内（离线刷新 `/web/` 会失败，`/web/dist/` 正常）
  ——见 [iteration-log 的活跃已知问题 K23](../docs/iteration-log.md#活跃已知问题)。

## 改哪边？

| 想改的东西 | 改哪里 |
|-----------|--------|
| 体验/算法/队列/主题等**真实功能** | `web/src/**`，然后 `npm run verify` 全绿（`web/dist` 由 CI 构建，不提交） |
| 主题模式的视觉与信息架构 | 主题模式设计稿（深底 + 琥珀金 / 六个 tab）；改视觉改 `src/styles.css` 与对应组件，别动 `index.html` |
| 只想让线上原型立刻变一下（不想碰构建） | 根 `index.html`（记得三同步：版本号 + iteration-log） |
| 两者都要一致 | 优先改 `web/`（有测试守着），根原型只在必要时同步；`sun.ts` 的改动必须先跑等价性测试 |
