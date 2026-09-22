# 迭代历史（归档）

> **这是归档文件，按需查证即可，不要当首屏读。**
> v0.1–v0.8 的详细记录——每版改动点、验证记录、实测数字、已解决 K 条目原文——都在这里，事实不丢。
>
> - 当前状态 / 活跃问题 / 版本摘要 → [`iteration-log.md`](iteration-log.md)
> - 部署形状（单一真源）→ [`../README.md`](../README.md#部署形状)
> - 已解决 / 已过期 K 条目原文 → [K 条目存档](#k-条目存档)

## v0.8 · 主题模式（两种产出 + 边拍边收 + 并发 9）

（2026-09-22）

### 背景

v0.7 把原型功能搬进 `web/` 后，产品重心从「拍照工具」移到「**主题**」：用户写一句主题（提示词）=
图生图的输入，再把多张照片交给它。设计稿（可交互单文件）定义了新的视觉语言与信息架构，本版把
它落成 `web/` 里**真能用**的一版（真相机、真 IndexedDB、真 AI 调用、真队列），不是静态演示。
**根 `index.html` 一行未改**（仍 v0.6）。

### 改动点

1. **主题是一等公民**（`domain/themes.ts` + 独立库 `data/themesDb.ts`）：主题记录
   `{id, name, prompt, words, mode, layout, strength, sourceIds, outputIds, status, collecting, ts}`；
   状态机 `idle → queued → running → done`、`collect-start/collect-shot/collect-end → ended`，
   非法迁移原样返回；界面只发事件、不直接改 status。
2. **提示词友好化**（`domain/promptBuilder.ts`）：5 组共 32 个词（词库逐字照设计稿）点选拼装、
   实时预览、三档质量提示（0 字 / <6 字 / ✓+字数）、换一批灵感、清空；6 条灵感胶囊整句填入。
3. **两种产出都真做**：
   - **合成一张** N → 1：客户端先按布局拼成一张大图（`domain/collage.ts`：网格拼贴 / 无缝融合 /
     故事板，1024×1152，`object-fit: cover` 裁剪 + 帧号 + 字幕条）→ 再送 `aiRedrawCore` 单图润色。
   - **统一风格** N → N：逐张重绘，同一主题同一提示词同一强度，**每张好了立刻归档进相册**。
4. **边拍边收（统一风格专属）**：主题可「启用」，取景页顶部出现主题条（主题名 + 已收张数 +
   结束按钮 + 红点脉冲）；**每按一次快门**：照片进胶卷 → 同步收进主题（计数 +1）→ 同步入队一个
   `n=1` 的统一风格子任务。结束主题 → `ended` + 跳暗房；详情面板可「继续边拍边收」追加进同一组。
   **快门路径仍是 2 处 await（本地取图 + 本机入库）**，收图与入队都是同步调用。
5. **并发上限 4 → 9**（`QUEUE_MAX`）+ **多图上限 9**（`THEME_MAX_SOURCES`）+ **主题任务只占 1 个槽位**：
   主题任务走 `runTheme` 通道（内部 2–9 张循环），调度器只 `active++` 一次；槽位与任务行显示
   `k/n` 分张进度（不是百分比）。
6. **视觉换成设计稿口径**：深底 `#0A0C0D` + 琥珀金 `#E9B44C`、等宽数字、35mm 取景框 / 焦距档
   13-26-35-50 / 网格循环（三分→螺旋→关）/ 直方图 / 曝光刻度 / 太阳轨迹 / 构图提示卡、
   8 台场景相机用**内联 SVG 插画**（`domain/sceneArt.ts`，逐值搬迁）+ 胶卷盒实物造型、
   胶片条（打孔 + 帧号 + 日期）、暗房显影槽 3×3、相册三分组。底部六个 tab：取景·主题·胶卷·暗房·相册·设置。
7. **数据兼容**：`snapsaga` 库仍是 **v2**（`photos`/`queue` 不动）——因为根原型用
   `indexedDB.open('snapsaga', 2)` 打开，把库升到 v3 会让它直接 `VersionError` 打不开；
   主题记录因此另开独立库 `snapsaga_themes`（v1，只存 id 引用不存 blob）。
   `PhotoRec` 只新增可选字段（`theme/themeName/merge/ids/layout`），老版本读到会忽略。

### 实测数字（真 Chromium + 真 IndexedDB，只 stub 相机与生图接口）

| 项目 | 实测 |
|------|------|
| 主题生效（边拍边收）时点击快门 | **0.6 ms** 同步返回（不 await AI） |
| 10 连拍（AI 接口故意慢） | **9 生成中 + 1 排队**，页面侧并发峰值 **9**，胶卷 10 张全入库 |
| 显影槽 | 3×3 = 9 个，占满 9 个 busy；第 10 个任务排队 |
| 一个主题任务（9 张素材） | 队列里 1 条任务、`active = 1`（不是 9），`n = 9`、`sources = 9` |
| 合成一张（3 张素材） | AI 调用 **1 次**（拼图在本地 canvas 完成），产出 **1 张**，槽位进度 `0/3 → 3/3` |
| 统一风格（3 张素材） | AI 调用 **3 次**，产出 **3 张**（逐张归档，每张好了就亮） |
| 边拍边收 | 连拍 3 张 → 主题收 3 张、队列 3 个子任务（每个 `n=1`）、产出 3 张；「继续边拍边收」后追加第 4 张 → 素材 4 / 产出 4 |
| 多图上限 9 | 10 张照片里「全选」只选到 9 张；点第 10 张被拒并提示「多图上限 9 张，先取消一张再选」，选图集合不变 |
| 产物体积 | JS **325.9 KB**（gzip 103.6 KB）· CSS 38.9 KB（gzip 8.7 KB） |

### 验证情况

`cd web && npm run verify` → **退出码 0**：

| 层 | 数量 | 内容 |
|----|------|------|
| build | — | `tsc --noEmit`（严格）零错误 + vite 构建 + 生成 `web/index.html` |
| 单测 | **149**（10 个文件） | 新增 `promptBuilder` 14 / `themes` 22 / `themeQueue` 15 / `collage` 27 / `sceneArt` 18；原有队列 9、缩略图 14、相机取图 16、AI Base 11、太阳算法等价性 3 |
| e2e | **139** | 主链路 36（并发 9）· **主题模式 63（新）** · 缩略图 13 · 拍照三环境 17 · AI Base 10 |
| guard | **93** | 源码侧 47 / 产物侧 22 / 产物运行时 12 / 子路径部署冒烟 7 |

新增的 guard 断言（主题模式红线）：并发上限常量与运行时 `MAX` 都是 9、多图上限 9 且两个入口（选图 /
边拍边收）都「拒绝 + 给原因」、`addTheme()` 只 push 一条任务、调度器里主题任务的 `active++` 只出现一次、
逐张归档、拼图降级开关、词库 32 词、相册「主题作品」分组、无付费/Pro 横幅、快门路径仍是 2 处 await。

**三处对既有验收脚本的调整**（都是「实现方式变了」，不是放宽断言）：

1. **主链路连拍数 6 → 10**：并发上限按设计稿从 4 改到 9，必须拍 10 张才能观察到「9 个在跑 + 1 个排队」。
2. **徽标断言 6 → 9+**：徽标本来就按设计稿封顶到「9+」（>9 不显示具体数字），待处理数量的真值改由队列本身断言。
3. **objectURL 活跃数**：从写死的 `≤ 60` 换成更强的**不变量**「活跃 URL ≤ 当前挂载的 `blob:` 图片元素数 + 5」——
   界面同时挂载的图变多了（胶片条 + 相册 + 显影槽 + 底部胶片条），写死数字会误报。

### 当时登记的问题

- 新增 **K24**（主题的真实出图效果未在真机 + 真 Key 下验证）、**K25**（主题任务快照带多图 blob，存储放大）、
  **K26**（无缝融合是启发式）、**K27**（设置是抽屉而非独立页）、**K28**（主题产出参数不可编辑）。
- 未变的旧条目：K2（长按删除）、K5（原图上限）、K8（快照存 blob）、K15（切后台挂起）、K17/K18（缩略图）、
  K20（两套实现）、K21（旧脚本依赖 bridge）、K22（真机相机）、K23（SW scope）、K3/K6/K9/K10/K11/K16（设计内取舍）。

## v0.7 · 工程化迁移（React 19 + TS + Vite，功能对齐 + 真测试 + 红线 guard）

（2026-09-22）

### 背景

原型单文件已到 74 KB / 1388 行，队列、缩略图、相机取图、拍立得、修图全挤在一个 `<script>` 里：
改一处要读全文，没有任何测试，唯一的验收手段是几个靠「从 HTML 里抽源码 eval」的脚本。
本版把功能**逐项对齐地**搬到工程化实现上（不新增产品功能），并把现有验收脚本搬成真测试。
**根 `index.html` 一行未改**（仍是 v0.6），新应用在 `web/`，线上子路径部署。

### 技术栈（照用户指定，不自创）

React 19 + react-dom · TypeScript 5.9（严格模式）· Vite（`base: './'`）· Tailwind CSS 4 ·
Zustand 5（状态）· Vitest 5 + jsdom（单测）· 手写 `public/sw.js` + `manifest.webmanifest`（PWA）。
**不引入**路由库 / 数据请求库 / 组件库 / CDN 依赖；ESLint/Prettier 未上（与参考项目一致）。

### 改动点

1. **目录**：新增 `web/`（`src/domain` 纯逻辑、`src/data` 数据层、`src/store` 状态、
   `src/components` 视图、`src/test` 单测、`e2e/` 验收、`scripts/guard.mjs`）。
2. **功能对齐 10 项**：取景（前后摄 / 网格随场景 / 水平仪 / 8 场景卡 / 快门闪白）、相机取图
   （静止图像优先 + 一次性抓帧回落 + 按能力下约束 + 取景信息条）、黄金时刻、胶卷（存取/删除/选中/
   缩略图/增量插入）、拍立得（合成 + 显影）、修图（本地滤镜 + 可选 AI 重绘）、生图队列（并发 4 /
   严格 FIFO / 排队 / 失败可重试 / 归档 / 面板徽标 / 持久化恢复）、AI 相册（分栏/大图/分享/保存/删除）、
   设置（Base/Key/模型/测试连通/清空全部数据）、启动申请 `navigator.storage.persist()`。
3. **太阳算法逐行等价搬迁**（铁律 4）：`src/domain/sun.ts` 保持原运算顺序与函数拆解，只加类型；
   新增 `src/test/sun.equivalence.test.ts` —— 把根 `index.html` 里的**原始实现抽出来在 node 里跑**，
   四城市 × 36 日期 × 5 时刻 × 6 字段逐值比对（epsilon 1e-9 ms）。
4. **数据与设置向后兼容**：库名 `snapsaga`、仓 `photos`/`queue`、照片记录字段（含 `thumb`）、
   `ss_ai_base`/`ss_ai_key`/`ss_ai_model`/`ss_gen_auto`/`ss_gen_style`/`snapsaga_geo` 全部沿用；
   AI 默认 Base 仍是 `https://api.klong.lat/v1`（旧默认自动迁移、自定义值尊重）。表结构只允许新增版本 + 兼容迁移。
5. **验收脚本搬成真测试**（断言未放松）：队列调度 18 条断言 → `src/test/genQueue.test.ts`；
   缩略图 13 项 / 拍照三环境 17 项 / AI 默认 Base 9 项 / 主链路 33 项 → `web/e2e/`（跑 `dist` 产物）。
   两处必要适配（换实现方式，非放宽）：objectURL 那条「revoke≈create」比例断言换成
   「重渲染 created 增量为 0」+「卸载即 revoke 且活跃数不增长」；openai 常量计数改为「HTML 0 处 + 产物 1 处」。
6. **`npm run guard`**（61 项，学 ImgX Studio 思路）：源码侧 31 项（快门路径不含 fetch/AI await、
   `ImageCapture` 在抓帧回落之前、缩略图 320/.72、列表挂 thumb、默认 Base、无本机绝对路径…）、
   产物侧 18 项（`base` 相对、产物里 ImageCapture/takePhoto/drawImage 都在、旧默认仅 1 处、PWA 文件已产出、
   `sw.js` 预缓存清单里每个文件都真实存在、入口页引用的产物文件都存在…）、**产物运行时 5 项**
   （真 Chromium 加载 dist + 生图接口挂死 → 6 张照片仍全部入库、队列并发峰值仍为 4）、
   **子路径部署冒烟 7 项**（按 Pages 的目录形状访问 `/web/`）。
   后两段是关键：防「源码对但构建出来不对」与「构建对但路径部署不对」。
7. **`src/debug/bridge.ts`**：暴露 `window.__snapsaga` 与旧脚本用的只读全局名（`PHOTOS`/`DB`/`GenQueue`/`cam`…），
   使根原型那批验收脚本能对准新产物跑；视图的 id/类名与原型保持一致，DOM 形状不变。
8. **文档**：新增 `web/README.md`（结构/命令/数据兼容/部署权衡/未覆盖项）；`AGENTS.md` 铁律 1 下补例外说明；
   根 `README.md` 增加 web 入口与目录。
9. **PWA**：`public/sw.js`（导航 network-first、静态资源 stale-while-revalidate，跨域生图请求不缓存）
   + `manifest.webmanifest` + SVG/PNG 图标（`scripts/make-icons.mjs` 可重新生成）。

### 部署形状（当时踩到的坑）

第一次推送后 `…/web/` 返回 200 但资源全 404：GitHub Pages 请求目录只会找 `index.html`，
而当时 Vite 的源入口就叫 `web/index.html`、产物在 `web/dist/`，两者对不上。
修正后的形状（`app.html` 作源入口、`index.html` 由构建生成）沿用至今；
**现行部署形状与管线只在 [`../README.md#部署形状`](../README.md#部署形状) 写一份。**

### 实测数字

| 指标 | 数值 | 来源 |
|------|------|------|
| 快门点击同步返回（生图接口故意挂死不返回） | **0.6–0.9 ms** | guard 运行时 / e2e |
| 快门点击返回（`takePhoto` 故意拖 300 ms） | **39 ms** | e2e 拍照三环境 |
| 原图 → 缩略图 | **1356.2 KB → 30.3 KB（44.7×）** | e2e 缩略图 |
| 老记录回填 | 1293.1 KB → 31.0 KB，且已落库 | e2e 缩略图 |
| 6 连拍队列 | 生成中 4 + 排队 2，页面侧 fetch 并发峰值 **4** | e2e 主链路 |
| 刷新恢复 | 3 条未完成续跑 + 6 条历史保留，全部归档 | e2e 主链路 |
| 构建产物 | JS 269.1 KB（gzip 86.4 KB）+ CSS 20.3 KB（gzip 5.1 KB） | vite build |

### 验证情况

| 项目 | 命令 | 结果 |
|------|------|------|
| TS 严格模式 + 构建 | `npm run build` | PASS：`tsc --noEmit` 零错误，vite 产物 442 ms |
| 单测（Vitest + jsdom） | `npm test` | PASS：**5 文件 / 53 测试**（队列调度 18 条对应断言 + 持久化恢复、缩略图尺寸与编码、AI Base 取值、太阳算法四城市等价、相机三环境与能力约束） |
| 红线 guard | `npm run guard` | PASS：**61 项**（源码 31 / 产物 18 / 产物运行时 5 / 子路径部署冒烟 7） |
| 验收 e2e（真 Chromium + 真 IndexedDB） | `npm run e2e` | PASS：**75 项**（主链路 35 / 缩略图 13 / 拍照 17 / AI Base 10），4/4 组通过 |
| 线上原型未被触碰 | `git diff --stat main -- index.html` | 无改动（根原型仍是 v0.6） |
| PWA 离线 | Playwright：首次访问注册 SW → 受控后 `setOffline(true)` 再 reload | PASS：SW scope `/`（本地按 dist 为根），离线 reload 返回 200 且取景页正常渲染 |
| 线上冒烟（真浏览器打开 Pages） | `…/web/` + 相机 stub + 生图接口挂死 | PASS：页面零错误、零 4xx/5xx；3 连拍 → 胶卷 3 张 + 队列 3 条（生成中 3，接口挂死也没挡住快门） |
| 视觉对齐 | Playwright 截图对比（移动 390×780 / 桌面 1280×800：取景/胶卷/拍立得/修图/相册/设置/队列） | 与原型逐屏一致，仅两处**改善**：打开相机后网格立即出现（原型要先切一次视图才出现）、拍立得未选图时提示文案更明确 |
| 未覆盖 | — | **真机相机路径仍未在 CI 里跑**（e2e 只有 canvas 流 + ImageCapture stub）；未用真实 Key 打通 `api.klong.lat`；未在 iOS Safari 上实测新应用 |

### 当时登记的问题

新增 K19–K23；同时注明 **K1（无 Service Worker）/ K4（无 manifest 与图标）在 `web/` 版本已解决**
（`public/sw.js` 保守缓存 + `manifest.webmanifest` + SVG/PNG 图标）；根原型仍是单文件，按需保留这两条。
K19 随后在本版收尾时即解决。原文见 [K 条目存档](#k-条目存档) 与 [`iteration-log.md`](iteration-log.md)。

---

## v0.6 · 缩略图 + 增量渲染（列表不再挂 3MB 原图）

（2026-09-22）

### 背景

iPhone 真机实测把隐患暴露了：真拍照原图 **3.1 MB**（12MP 级），解码后位图约 **49 MB/张**，
而胶卷网格是 `for(const p of PHOTOS)` 全量重建并直接挂**原图** —— 20 张就是 ~1 GB 位图挂在内存里。
换框架救不了这件事（React 一样会把原图塞进 `<img>`），得先把缩略图做了。

### 改动点

1. 新增 `makeThumb()`：`createImageBitmap`（解码不占主线程）→ 缩到最长边 320 → `toBlob('image/jpeg', .72)`；
   失败返回 `null`，渲染回落用原图。
2. **缩略图不进快门 await 链**：`addPhoto()` 先落库原图、立即 `prependFilmCell()`，然后 `queueThumb()`
   **fire-and-forget** 在后台生成；生成好后只换这一格的图（先挂新 URL 再回收旧 URL）。快门的不阻塞不变量保持不变。
3. **增量渲染**：`prependFilmCell()` / `filmCellFor()` 拆出，新拍一张只 `grid.prepend()` 一格，
   不再重建整个网格（已有格子的 DOM 节点与已解码位图都保住）；删除、切相册等仍需全量的场景走 `renderFilm()`。
   AI 相册同理（`albumCellFor` / `refreshAlbumThumb`）。
4. 网格与队列面板的 `<img>` 加 `decoding="async"` + `loading="lazy"`。
5. 队列面板缩略图优先级：已完成结果缩略图 > 源照片缩略图 > 结果/原图；归档后把缩略图回写到任务上。
6. **老记录兼容**：本版之前存的照片没有 `thumb` 字段，`backfillThumbs()` 在启动后逐张补
   （一次一张、让出主线程），补好即落库，下次不必重算。

### 实测收益（Playwright + 真 IndexedDB；用带噪声的 1200×1600 图模拟大 JPEG）

| 指标 | 数值 |
|------|------|
| 原图 | **1356.2 KB** |
| 缩略图 | **30.3 KB** |
| 缩减倍数 | **44.7×** |
| 快门延迟（含大图编码） | 85 / 93 / 87 ms（未被缩略图拖慢） |
| 增量插入 | 新增 1 格，原有格子**节点复用**（状态保住） |
| 老记录回填 | 1293 KB 原图 → 31 KB 缩略图，且已落库 |

### 验证情况

| 项目 | 命令 | 结果 |
|------|------|------|
| 缩略图/增量/回填专项 | `node check_thumbs.cjs <repo>` | PASS 13 项（上表即其输出） |
| HTML / JS | `html.parser` / `node --check` | PASS |
| 队列调度（用户脚本，未改一字） | `node check_queue.mjs` | PASS 18 项 |
| 队列 + 快门静态检查（仓库内） | `node tools/check_gen_queue.mjs` | PASS（新增 4 条断言：列表用 thumb、queueThumb 不进 await 链、decoding=async、prepend 增量） |
| 拍照三环境 | `node check_capture.cjs` | PASS |
| 端到端浏览器 | Playwright `ss_e2e.cjs` | PASS |

### 当时登记的问题

新增 K17 / K18（原文见 [`iteration-log.md`](iteration-log.md) 的活跃问题表）。

---

## v0.5 · 真机实测回归（iOS 也能真拍照 + 按能力下约束 + 主动申请持久存储）

（2026-09-22）

### 背景

用 `tools/ios-probe.html` 在真机 **iPhone（iOS 26.6，Safari）** 上实测一轮，
推翻了 v0.4 里一条错误预设，并拿到两条对架构有决定性影响的事实。

### 真机实测结果（iPhone / iOS 26.6 / HTTPS）

| 项目 | 实测 |
|------|------|
| **`ImageCapture.takePhoto`** | **存在且成功**（v0.4 曾假设 iOS 不支持，**该假设已推翻**） |
| 后摄真拍照 / 抓帧 | **3 106 140 B / 554 689 B** → 真拍照数据量约 **5.6×** |
| 前摄真拍照 / 抓帧 | **3 809 768 B / 1 180 675 B** |
| 预览分辨率 | 1440×2560（竖屏，即 2560×1440，与请求的 ideal 一致） |
| 相机可控项 | aspectRatio / backgroundBlur / deviceId / facingMode / **focusDistance** / frameRate / height / **torch** / **whiteBalanceMode** / width / **zoom**（**无 focusMode**） |
| IndexedDB | 可写可读（含 Blob） |
| `storage.persist()` | API 存在，初始为**未持久**（配额 9830 MB） |
| **切后台** | 计时器**被挂起，最长 51.5 s 没跳** → 后台生图会暂停 |
| Web Share | 支持（含带文件 → 存相册/分享路径可用） |
| 不支持 | Web Bluetooth / 屏幕方向锁定 / 震动；Notification、Web Push 在**浏览器标签页**下不支持（需「加到主屏」后再复测） |

### 改动点

1. **`camTune()` 改为按能力下约束**：先读 `getCapabilities()`，只对设备真的支持的项调 `applyConstraints`
   （宽高、连续对焦、连续白平衡）。此前无条件试试 `focusMode:'continuous'`，而 iPhone 根本没有 focusMode
   ——硬下只会白白报错并掩盖真实原因。
2. **主动申请持久存储**：新增 `ensurePersist()`，`init()` 时调 `navigator.storage.persist()`
   （已是则跳过，失败静默，结果进 console）。照片全在 IndexedDB，不能等系统回收了才发现。
3. `cam.caps` 缓存能力清单，供后续做手电/变焦控件（iPhone 与安卓均报告支持 `torch` / `zoom`）。

### 验证情况

| 项目 | 命令 | 结果 |
|------|------|------|
| HTML 结构 / JS 语法 | `python3 html.parser` / `node --check` | PASS |
| 按能力下约束（stub track 报告仅有 zoom/torch） | `node check_capture.cjs <repo>` | PASS：绝不向不支持的能力下约束；支持项才下发 |
| 拍照三环境（真拍照 / 回落 / 无 API） | 同上 | PASS 全部通过 |
| 队列调度（用户脚本，未改一字） | `node check_queue.mjs <index.html>` | PASS 全部 18 项 |
| 队列 + 持久化 + 快门静态检查（仓库内） | `node tools/check_gen_queue.mjs` | PASS |
| 端到端浏览器 | Playwright `ss_e2e.cjs` | PASS |
| 真机实测 | `tools/ios-probe.html` @ iPhone iOS 26.6 | 见上表；已由用户粘贴报告确认 |

### 当时登记的问题

更正 K12（真机实测推翻 v0.4 的假设）；新增 K15 / K16。

---

## v0.4 · 真拍照（优先静止图像管线，失败回落抓帧）

（2026-09-22）

### 背景

v0.3 之前所谓「拍照」实际上只是把实时预览的当前一帧画进 canvas——浏览器给网页的相机只有视频轨，
这是代价最低的取图方式，但分辨率、对焦、曝光全部跟着视频流走，没有 EXIF，运动主体易糊。
本版优先走设备的**静止图像管线**。

### 改动点

1. 新增 `grabStill()`：检测到 `window.ImageCapture` 且有视频轨时，用 `new ImageCapture(track).takePhoto()`
   取真照（分辨率/对焦由相机静止管线决定）；不支持或抛错则回落为 `canvas.drawImage(video)` 抓帧。
   两条路都只返回 `{blob, kind}`（`still` / `frame`），**都不碰 AI、不碰队列**。
2. `capture()` 改为 `await grabStill()`，其余逻辑不变：仍然「本地取图 → 存胶卷 → 同步入队」，
   队列与 AI 的异步特性不受影响。
3. 新增 `camTune()`：打开相机后逐项 `applyConstraints`（分辨率上调到理想 3840×2160、连续对焦），
   **每项独立 try**，任一项不被支持不影响其它项；用 `getSettings()` 把实际分辨率读出来。
4. 取景页新增信息条 `#camMeta`：实时显示「相机 1280×720 · 支持静止图像 / 仅能抓帧 · 本次：静止图像 / 抓帧」。
   降级不再静默，用户能自己看出这张图是怎么来的。
5. 照片记录新增 `shot` 字段（`still` / `frame`）便于事后排查画质问题。
6. 回落是「一次性降级」：takePhoto 失败就把 `cam.still` 置 false 并刷新信息条，本次会话不再重试，
   避免每张都白等一次失败。
7. 新增 `tools/ios-probe.html`：真机能力探测页（相机取图与静止图管线 / IndexedDB + persist /
   切后台计时器是否挂起 / Web Share、蓝牙等），用于判断「网页方案够不够」还是「必须上原生」。

### 验证情况

| 项目 | 命令 | 结果 |
|------|------|------|
| HTML 结构 | `python3 <html.parser 脚本>` | PASS：0 个未闭合/孤立标签 |
| JS 语法 | 抽出 `<script>` → `node --check` | PASS |
| 拍照三环境专项（真 Chromium + 真 canvas 流） | `node check_capture.cjs <repo>` | PASS 15 项：① 支持 ImageCapture → 存下的就是 takePhoto 的字节数、信息条显示「静止图像」；② takePhoto 抛错 → 回落抓帧且 `cam.still=false`、后续不重试；③ 无 ImageCapture（iOS Safari 环境）→ 抓帧照常可用且可连拍；④ 连拍 3 张 → 胶卷入 3 张、队列收 3 条（拍照依旧不阻塞队列） |
| 快门不被阻塞（takePhoto 故意拖 300ms） | 同上 | PASS：点击处理 35ms 返回 |
| 队列调度（用户脚本，未改一字） | `node check_queue.mjs <index.html>` | PASS 全部 18 项 |
| 队列调度 + 持久化 + 快门静态检查（仓库内） | `node tools/check_gen_queue.mjs` | PASS：断言已升级为「快门只能 await 本地取图/入库」「grabStill 优先 takePhoto 且有抓帧回落」「两条路都只产出 Blob」 |
| 端到端浏览器（相机 stub） | Playwright `ss_e2e.cjs` | PASS：快门 1.2ms 返回 / 6 连拍 → 并发 4 + 排队 2 / 刷新续跑 / 失败重试 / objectURL 有界 |
| 未覆盖 | — | **未在真机/手机浏览器上验证相机路径**（本机无摄像头可用，测试环境只有 canvas 流 stub；原本计划用局域网那台安卓平板实测，但该设备本次已离线：ping 不通、5555 无响应）。因此「真机 takePhoto 能否拿到更高分辨率」尚未实测 |

### 当时登记的问题

新增 K12 / K13 / K14；「未在真机验证相机路径」这条由 v0.5 的 iPhone 实测补上。

---

## v0.3 · 生图默认 Base 指向 api.klong.lat

（2026-09-22）

### 背景

v0.2 的 AI 生图 Base 默认值还是 `https://api.openai.com/v1`，且**只在设置框里当预填值**：
`aiCreds()` 读不到已保存值时返回空字符串，等于没手动填过 Base 的机器上 AI 完全用不了。
本版把默认 Base 改成 `https://api.klong.lat/v1`，并让它真的生效。

### 改动点

1. 新增 `AI_BASE_DEFAULT = 'https://api.klong.lat/v1'` 与 `aiBaseSetting()`：未填过 → 用默认值；
   填过 → 用用户的值（去掉尾部 `/`）。默认值从此只在一处定义，设置框与生图请求共用。
2. `aiCreds()` 的 `base` 改为走 `aiBaseSetting()`，所以**只填 Key 就能生图**
   （请求仍打 `<base>/images/edits`，与 v0.2 路径结构一致）。
3. 设置面板打开时 `#aiBase` 预填 `aiBaseSetting()`；输入框占位文案与「未配置 AI」提示同步改为
   「填 API Key（Base 已有默认值）」，不再误导用户以为必须填 Base。
4. 保留旧默认 `https://api.openai.com/v1` 为 `AI_BASE_LEGACY`，仅用于识别「没主动改过、只是沿用了旧默认值」
   的浏览器：这种情况直接换成新默认，不会把人卡在 openai 上。

### 验证情况

| 项目 | 命令 | 结果 |
|------|------|------|
| HTML 结构 | `python3 <html.parser 脚本>` | PASS：0 个未闭合/孤立标签 |
| JS 语法 | 抽出 `<script>` → `node --check` | PASS |
| 队列调度（用户脚本，未改一字） | `node check_queue.mjs <index.html>` | PASS 全部 18 项 |
| 队列调度 + 持久化（仓库内） | `node tools/check_gen_queue.mjs` | PASS 全部 41 项 |
| 默认 Base 是否真的生效 | Playwright：清空 localStorage 后读 `aiCreds().base` 与设置框预填值 | PASS：两者均为 `https://api.klong.lat/v1`；只填 Key 即视为已配置 |
| 未覆盖 | — | 没有用真实 Key 打过 `api.klong.lat`（无凭证）；该服务的 CORS 行为未知，仍受 K3 约束 |

### 当时登记的问题

新增 K11（用户手动保存过自定义 Base 的浏览器不会被覆盖）。

---

## v0.2 · 生图队列（拍照不等生成）

（2026-09-22）

### 背景

v0.1 的生图（AI 重绘）是「点一下 → 全屏等待 20–60s」，与拍摄冲突。
本版把生图拆成后台任务：拍照只管拍，生图交给队列。

### 改动点

1. **拍照不被阻塞**（`capture()`）：快门路径只做「canvas 编码 → 写 IndexedDB 胶卷 → `GenQueue.add()` 同步入队」，
   全路径无 AI 调用、无 AI await。新增 `async function aiRedrawCore(blob,style,strength)` 作为唯一生图通道
   （修图页与队列共用，去掉 UI），修图页的 `aiRedraw()` 变成它的 UI 包装。
2. **后台列表 + 入口徽标**：页头 ✨ 徽标显示「生成中 + 排队中」数量（生成中时脉冲动画），
   点开底部面板逐条显示 排队中（含位次）/ 生成中 / 已完成 / 失败，失败条目带可读原因 + 重试 / 移除；
   面板顶部实时汇总「并发上限 4 · 生成中 n · 排队 n · 已完成 n · 失败 n」。
   新增第 5 个 tab「✨ AI 相册」作为归档入口。
3. **并发上限 4 + FIFO**：`GenQueue{MAX:4, pump(), run()}`；`pump()` 是同步 while 循环补齐空位
   （内部无 await，不是串行等待），任务队列数组按入队顺序取（先进先出），任务结束（成功或失败）后都调 `pump()` 补位。
4. **完成即归档**：`archiveResult(task,outBlob)` 把结果写成 `{kind:'ai'}` 记录入库并进 `AI_ALBUM`，
   胶卷只放原片（`PHOTOS` 过滤 `kind!=='ai'`）；AI 相册点开可看大图 / 另存分享 / 删除 / 送去做拍立得。
5. **失败可重试、不卡队列**：失败任务标 `failed` + `humanAiErr()` 可读信息（含 CORS 提示），
   失败即让位给下一笔；`retry(id)` 重新排队，`drop(id)` / `clearFinished()` 清理。

### 三个坑的处理

| 坑 | 处理 |
|----|------|
| 刷新丢队列 | IndexedDB 升到 v2，新增 `queue` 对象仓（`DB.putTasks/tasks`）；入队/状态变化/结束时都写整表快照（快照含源图 blob，所以恢复后不依赖原片还在）；`init()` 里 `GenQueue.restore()`，把被刷新打断的 `running` 重新排队并立即 `pump()`，`done` 恢复成历史不再入队，`restore` 时裁掉超过 30 条的旧历史 |
| 对象 URL 泄漏 | 队列面板 / 胶卷 / AI 相册三处都维护「当前批次 URL 数组」，重渲染时先建新批次、挂完 DOM 再 revoke 旧批次（队列源码本身不造 URL，生命周期集中在一处）；大图关闭时先摘 `img.src` 再 revoke |
| 并发要真并起来 | `run()` 同步标 `running`、`active++`，把生图丢进 `(async()=>{...})()` 后立即返回，不把 Promise 交给 `pump()`；实测并发峰值 = 4（页面侧 fetch 计数与 stub 计数一致） |

### 其他

- 取景页新增「拍完自动生图」开关 + 风格选择（状态存 localStorage），可在拍照前选风格、也可关掉只用修图页手动生图。
- 「清空全部数据」现在同时清 photos / queue 两个仓，并用 `GenQueue.reset()`（epoch 增量）让在飞的生成结果作废，
  避免清空后又被写回一张。
- 顺手修了 v0.1 遗留：`renderFilm()` 每次重渲染都新建 objectURL 且从不 revoke（长列表会持续吃内存），现改为批次回收。
- 新增 `tools/check_gen_queue.mjs`（零依赖 node 脚本）作为队列的常规验证入口。

### 验证情况

| 项目 | 命令 | 结果 |
|------|------|------|
| HTML 结构 | `python3 <html.parser 脚本>` | PASS：0 个未闭合/孤立标签，1 个 `<script>` 块 37697 字符 |
| JS 语法 | 抽出全部 `<script>` → `node --check` | PASS |
| 队列调度（用户脚本，未改一字） | `node check_queue.mjs <index.html>` | PASS 全部 18 项：并发峰值 4 / FIFO q0…q7 / 失败不卡队列 / 重试后归档 6 / 10 笔全部归档 |
| 队列调度 + 持久化 + 静态检查（仓库内） | `node tools/check_gen_queue.mjs` | PASS 全部 41 项，含：落库快照 6 条带 blob、恢复后 running 重新排队并补位到 4、恢复后仍 FIFO、已完成快照不再入队/不重复归档、`capture()` 里只有 2 处本机 await（canvas 编码 + IndexedDB） |
| 端到端浏览器（临时脚本，真实 Chromium + 真实 IndexedDB；相机与生图接口用 stub） | Playwright 390×780 | PASS：快门点击 0.6ms 返回、6 连拍 → 4 生成中 + 2 排队 + 徽标 6、AI 并发峰值 4、6 张全部归档到 AI 相册且胶卷不含 AI 结果、刷新后 3 条未完成任务自动续跑并归档（相册 9）、失败 1 条可读原因「服务端 500」+ 重试成功归档、反复重渲染 12 轮后活跃 objectURL 33（created 682 / revoked 649，不增长）、清空后三个列表都为空 |
| 未覆盖 | — | **没有在真机/手机浏览器上过相机路径**（本机只能跑桌面 Chromium + 相机 stub）；AI 直连的 CORS 限制未变（K3）；未接入真实生图服务跑端到端 |

### 当时登记的问题

登记 K1–K18（K1–K7 首次登记于 v0.1，本版补 K8–K10；K11–K18 由后续 v0.3–v0.6 陆续登记）。
原文全部见 [`iteration-log.md`](iteration-log.md)（活跃）与 [K 条目存档](#k-条目存档)（已解决）。

---

## v0.1 · 出行原型

（2026-09-22）

### 功能清单

- **取景**：getUserMedia 后/前摄切换、三分/黄金螺旋网格（随场景切换）、电子水平仪（iOS 需手势授权）、
  8 场景构图提示卡、快门闪白
- **黄金时刻**：本地天文计算（太阳高度 -4°~+6° 为黄金窗口），倒计时与晨/昏窗口显示，全离线
- **胶卷**：IndexedDB 本机存储，多选、缩略图、长按删除（contextmenu）
- **拍立得工坊**：三种胶片（600/SX-70/宽幅）偏色与比例、Canvas 颗粒（pattern 平铺）+暗角、日期戳、
  手写注记（模板随机 + 手输）、10 秒显影动画、Web Share / 下载保存
- **主题修图**：5 个本地滤镜（canvas ctx.filter + 叠色，强度混合）离线可用；可选配置 API Base/Key/Model
  直连 `images/edits` 调 gpt-image-2 真重绘（b64/url 双兼容），失败降级提示
- **设置**：定位/手填经纬度、AI 配置与连通测试、数据清空

### 验证情况

- HTML 结构校验通过（无未闭合标签）；JS `node --check` 通过
- **太阳算法四城市实测：成都/北京/赫尔辛基/三亚，日出日落与参考值偏差 <11 分钟**（铁律 4 的来源）
- 线上部署：GitHub Pages，HTTPS 200

### 当时登记的问题

首次登记 K1–K7（原文见 [K 条目存档](#k-条目存档) 与 [`iteration-log.md`](iteration-log.md)）。
当时的候选清单是「出游实测反馈 → K1 离线缓存 / K4 manifest → K2 胶卷管理 → 拍立得照片墙 → prompt 模板可编辑」，
其中前四项已被 v0.2–v0.7 消化，只剩 prompt 模板可编辑仍在候选里。

---

## K 条目存档

> 已解决 / 已过期 / 已缓解的条目**原文保留**（编号是历史锚点，不重排、不复用）。
> 仍未解决（需要动手）与设计内取舍的条目见 [`iteration-log.md`](iteration-log.md)。
> 表格行首列 `K<n>` 是全仓库唯一的定义处；`scripts/check-docs.mjs` 会校验编号连续且不重复。

| # | 问题 | 影响 | 计划 / 结论 |
|---|------|------|------|
| K1 | **已解决（web 版）**：无 Service Worker，首次打开页面需网络（根原型仍是单文件，按需保留） | 弱网下二次加载慢 | `web/public/sw.js`：导航 network-first、`./assets/*` stale-while-revalidate、跨域生图请求不缓存；guard 里第 7 组「子路径部署冒烟」兼顾 SW 路径 |
| K4 | **已解决（web 版）**：无 web app manifest 与图标，iOS 添加主屏无专属图标（根原型同 K1） | 体验细节 | `web/public/manifest.webmanifest` + SVG/PNG 图标（`scripts/make-icons.mjs` 可重新生成） |
| K7 | **已过期**：拍立得注记输入框高度固定，长文案折行在低分屏可能溢出 | 边角体验 | 前提不成立：实现里是单行 `<input>`（`#polaNote` / `.field input{flex:1;min-width:0}`），文本不折行、可横向滚动且能随容器收缩；未再观察到溢出 |
| K12 | **已解决（真机更正）**：`ImageCapture.takePhoto` 的支持按浏览器/版本而异；v0.4 曾假设 iOS 不支持 | 旧设备仍可能只拿到抓帧 | v0.5 iPhone iOS 26.6 实测**支持**（真照约 3.1–3.8 MB，为抓帧的 5.6×）；实现改为**运行时能力探测 + 一次性回落**，不按 UA 判断，信息条如实显示本次走的是哪条路 |
| K13 | **已缓解**：`takePhoto()` 在部分设备/视频流上会失败（已自动回落抓帧并把 `cam.still` 置 false，本次会话不重试） | 用户可能不知道这张图是抓帧 | 取景信息条已如实显示；「首次降级弹一次提示」属可选优化，未做 |
| K14 | **已缓解**：`applyConstraints` 的 3840×2160 只是「理想值」，实际分辨率由设备决定；部分设备不支持 `focusMode:'continuous'`，失败静默 | 提升幅度因机而异 | 信息条已显示实际分辨率（v0.5 起还先读 `getCapabilities()` 只下支持的约束）；真机差异统一由 iteration-log K22 跟踪 |
| K19 | **已解决（2026-09-22）**：`web/dist` 必须提交进仓库（Pages 从分支提供、没有 CI 构建），产物 diff 会进 git 历史 | 无（产物 diff 不再进 git 历史） | Pages 已切到 GitHub Actions 发布（`build_type: workflow`），`web/dist` 不再提交、由 CI 构建：`npm ci → npm test → npm run build → npm run guard → scripts/assemble-site.mjs 组装 → upload-pages-artifact → deploy-pages`。现行形状见 [`../README.md#部署形状`](../README.md#部署形状) |
