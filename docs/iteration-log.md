# 迭代日志

记录每版改动、验证情况与已知问题。新版本请追加在最上方。

> v0.7 起本仓库有两个入口：根 `index.html`（单文件原型，v0.6 冻结，**本版一行未改**）与
> `web/`（工程化 React 版，线上 <https://tomorrowdolol.github.io/snapsaga-trip-prototype/web/>）。
> 功能与数据以「两者同源」为前提：同一个 IndexedDB 库、同一批 localStorage 键。

---

## v0.7 — 2026-09-22（工程化迁移：React 19 + TS + Vite，功能对齐 + 真测试 + 红线 guard）

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
6. **`npm run guard`**（47 项，学 ImgX Studio 思路）：源码侧 31 项（快门路径不含 fetch/AI await、
   `ImageCapture` 在抓帧回落之前、缩略图 320/.72、列表挂 thumb、默认 Base、无本机绝对路径…）、
   产物侧 11 项（`base` 相对、产物里 ImageCapture/takePhoto/drawImage 都在、旧默认仅 1 处、PWA 文件已产出…）、
   **产物运行时 5 项**（真 Chromium 加载 dist + 生图接口挂死 → 6 张照片仍全部入库、队列并发峰值仍为 4）。
   最后一段是关键：防「源码对但构建出来不对」。
7. **`src/debug/bridge.ts`**：暴露 `window.__snapsaga` 与旧脚本用的只读全局名（`PHOTOS`/`DB`/`GenQueue`/`cam`…），
   使根原型那批验收脚本能对准新产物跑；视图的 id/类名与原型保持一致，DOM 形状不变。
8. **文档**：新增 `web/README.md`（结构/命令/数据兼容/部署权衡/未覆盖项）；`AGENTS.md` 铁律 1 下补例外说明；
   根 `README.md` 增加 web 入口与目录。
9. **PWA**：`public/sw.js`（导航 network-first、静态资源 stale-while-revalidate，跨域生图请求不缓存）
   + `manifest.webmanifest` + SVG/PNG 图标（`scripts/make-icons.mjs` 可重新生成）。

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
| 红线 guard | `npm run guard` | PASS：**47 项**（源码 31 / 产物 11 / 产物运行时 5） |
| 验收 e2e（真 Chromium + 真 IndexedDB） | `npm run e2e` | PASS：**75 项**（主链路 35 / 缩略图 13 / 拍照 17 / AI Base 10），4/4 组通过 |
| 线上原型未被触碰 | `git diff --stat main -- index.html` | 无改动（根原型仍是 v0.6） |
| 视觉对齐 | Playwright 截图对比（移动 390×780 / 桌面 1280×800：取景/胶卷/拍立得/修图/相册/设置/队列） | 与原型逐屏一致，仅两处**改善**：打开相机后网格立即出现（原型要先切一次视图才出现）、拍立得未选图时提示文案更明确 |
| 未覆盖 | — | **真机相机路径仍未在 CI 里跑**（e2e 只有 canvas 流 + ImageCapture stub）；未用真实 Key 打通 `api.klong.lat`；未在 iOS Safari 上实测新应用 |

### 已知问题与限制

| # | 问题 | 影响 | 计划 |
|---|------|------|------|
| K19 | **`web/dist` 必须提交进仓库**：Pages 目前从分支直接提供、没有 CI，不提交产物线上就拿不到新版本 | 每次改前端都要 build 一次并把产物一起提交，产物 diff 进 git 历史 | 把 Pages 源切成 GitHub Actions（build → upload-pages-artifact）后，即可在 `web/.gitignore` 里加上 `dist/`。权衡已写在 `web/README.md` |
| K20 | 现在有**两套实现**（根 `index.html` 与 `web/`），同一功能改两边会漂移；只有太阳算法有数值等价性测试守着 | 根原型的后续改动不会自动出现在 web 版（反之亦然） | 功能演进只改 `web/`（有测试 + guard），根原型冻结；若必须两边同改，先改 `web/` 再同步并跑 `npm run verify` |
| K21 | 旧验收脚本（`snapsaga_queue_check/*.cjs`、`ss_e2e.cjs`）依赖页面全局（`PHOTOS`/`DB`/`GenQueue`/`cam`…），新应用靠 `src/debug/bridge.ts` 提供只读兼容层才能跑 | 删掉 bridge 就会让那批脚本失效（`web/e2e/` 已内化同样断言，不受影响） | 保留 bridge（零成本、便于线上排查）；新验收一律写在 `web/e2e/` |
| K22 | e2e 里相机仍是 canvas 流 + `ImageCapture` stub；真机 `takePhoto` 的分辨率提升、iPhone 真实能力清单都不在 CI 覆盖内（延续 K12/K13/K14） | 真机行为仍可能与本机不一致（历史教训：v0.4 曾误判 iOS 不支持 takePhoto） | 出游实测时用 `tools/ios-probe.html` + 新应用的取景信息条（会显示实际分辨率与本次是静止图像还是抓帧）复测 |

另外：**K1（无 Service Worker）/ K4（无 manifest 与图标）在 `web/` 版本已解决**
（`public/sw.js` 保守缓存 + `manifest.webmanifest` + SVG/PNG 图标）；根原型仍是单文件，按需保留这两条。

---

## v0.6 — 2026-09-22（缩略图 + 增量渲染：列表不再挂 3MB 原图）

### 背景

iPhone 真机实测把隐患暴露了：真拍照原图 **3.1 MB**（12MP 级），解码后位图约 **49 MB/张**，而胶卷网格是 `for(const p of PHOTOS)` 全量重建并直接挂**原图** —— 20 张就是 ~1 GB 位图挂在内存里。换框架救不了这件事（React 一样会把原图塞进 `<img>`），得先把缩略图做了。

### 改动点

1. 新增 `makeThumb()`：`createImageBitmap`（解码不占主线程）→ 缩到最长边 320 → `toBlob('image/jpeg', .72)`；失败返回 `null`，渲染回落用原图。
2. **缩略图不进快门 await 链**：`addPhoto()` 先落库原图、立即 `prependFilmCell()`，然后 `queueThumb()` **fire-and-forget** 在后台生成；生成好后只换这一格的图（先挂新 URL 再回收旧 URL）。快门的不阻塞不变量保持不变。
3. **增量渲染**：`prependFilmCell()` / `filmCellFor()` 拆出，新拍一张只 `grid.prepend()` 一格，不再重建整个网格（已有格子的 DOM 节点与已解码位图都保住）；删除、切相册等仍需全量的场景走 `renderFilm()`。AI 相册同理（`albumCellFor` / `refreshAlbumThumb`）。
4. 网格与队列面板的 `<img>` 加 `decoding="async"` + `loading="lazy"`。
5. 队列面板缩略图优先级：已完成结果缩略图 > 源照片缩略图 > 结果/原图；归档后把缩略图回写到任务上。
6. **老记录兼容**：本版之前存的照片没有 `thumb` 字段，`backfillThumbs()` 在启动后逐张补（一次一张、让出主线程），补好即落库，下次不必重算。

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

### 已知问题与限制

- 新增 K17 / K18。

---

## v0.5 — 2026-09-22（真机实测回归：iOS 也能真拍照 + 按能力下约束 + 主动申请持久存储）

### 背景

用 `tools/ios-probe.html` 在真机 **iPhone（iOS 26.6，Safari）** 上实测一轮，推翻了 v0.4 里一条错误预设，并拿到两条对架构有决定性影响的事实。

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

1. **`camTune()` 改为按能力下约束**：先读 `getCapabilities()`，只对设备真的支持的项调 `applyConstraints`（宽高、连续对焦、连续白平衡）。此前无条件试试 `focusMode:'continuous'`，而 iPhone 根本没有 focusMode——硬下只会白白报错并掩盖真实原因。
2. **主动申请持久存储**：新增 `ensurePersist()`，`init()` 时调 `navigator.storage.persist()`（已是则跳过，失败静默，结果进 console）。照片全在 IndexedDB，不能等系统回收了才发现。
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

### 已知问题与限制

- 更正 K12；新增 K15 / K16。

---

## v0.4 — 2026-09-22（真拍照：优先静止图像管线，失败回落抓帧）

### 背景

v0.3 之前所谓「拍照」实际上只是把实时预览的当前一帧画进 canvas——浏览器给网页的相机只有视频轨，这是代价最低的取图方式，但分辨率、对焦、曝光全部跟着视频流走，没有 EXIF，运动主体易糊。本版优先走设备的**静止图像管线**。

### 改动点

1. 新增 `grabStill()`：检测到 `window.ImageCapture` 且有视频轨时，用 `new ImageCapture(track).takePhoto()` 取真照（分辨率/对焦由相机静止管线决定）；不支持或抛错则回落为 `canvas.drawImage(video)` 抓帧。两条路都只返回 `{blob, kind}`（`still` / `frame`），**都不碰 AI、不碰队列**。
2. `capture()` 改为 `await grabStill()`，其余逻辑不变：仍然「本地取图 → 存胶卷 → 同步入队」，队列与 AI 的异步特性不受影响。
3. 新增 `camTune()`：打开相机后逐项 `applyConstraints`（分辨率上调到理想 3840×2160、连续对焦），**每项独立 try**，任一项不被支持不影响其它项；用 `getSettings()` 把实际分辨率读出来。
4. 取景页新增信息条 `#camMeta`：实时显示「相机 1280×720 · 支持静止图像 / 仅能抓帧 · 本次：静止图像 / 抓帧」。降级不再静默，用户能自己看出这张图是怎么来的。
5. 照片记录新增 `shot` 字段（`still` / `frame`）便于事后排查画质问题。
6. 回落是「一次性降级」：takePhoto 失败就把 `cam.still` 置 false 并刷新信息条，本次会话不再重试，避免每张都白等一次失败。
7. 新增 `tools/ios-probe.html`：真机能力探测页（相机取图与静止图管线 / IndexedDB + persist / 切后台计时器是否挂起 / Web Share、蓝牙等），用于判断「网页方案够不够」还是「必须上原生」。

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

### 已知问题与限制

- 新增 K12 / K13 / K14。

---

## v0.3 — 2026-09-22（生图默认 Base 指向 api.klong.lat）

### 背景

v0.2 的 AI 生图 Base 默认值还是 `https://api.openai.com/v1`，且**只在设置框里当预填值**：`aiCreds()` 读不到已保存值时返回空字符串，等于没手动填过 Base 的机器上 AI 完全用不了。本版把默认 Base 改成 `https://api.klong.lat/v1`，并让它真的生效。

### 改动点

1. 新增 `AI_BASE_DEFAULT = 'https://api.klong.lat/v1'` 与 `aiBaseSetting()`：未填过 → 用默认值；填过 → 用用户的值（去掉尾部 `/`）。默认值从此只在一处定义，设置框与生图请求共用。
2. `aiCreds()` 的 `base` 改为走 `aiBaseSetting()`，所以**只填 Key 就能生图**（请求仍打 `<base>/images/edits`，与 v0.2 路径结构一致）。
3. 设置面板打开时 `#aiBase` 预填 `aiBaseSetting()`；输入框占位文案与「未配置 AI」提示同步改为「填 API Key（Base 已有默认值）」，不再误导用户以为必须填 Base。
4. 保留旧默认 `https://api.openai.com/v1` 为 `AI_BASE_LEGACY`，仅用于识别「没主动改过、只是沿用了旧默认值」的浏览器：这种情况直接换成新默认，不会把人卡在 openai 上。

### 验证情况

| 项目 | 命令 | 结果 |
|------|------|------|
| HTML 结构 | `python3 <html.parser 脚本>` | PASS：0 个未闭合/孤立标签 |
| JS 语法 | 抽出 `<script>` → `node --check` | PASS |
| 队列调度（用户脚本，未改一字） | `node check_queue.mjs <index.html>` | PASS 全部 18 项 |
| 队列调度 + 持久化（仓库内） | `node tools/check_gen_queue.mjs` | PASS 全部 41 项 |
| 默认 Base 是否真的生效 | Playwright：清空 localStorage 后读 `aiCreds().base` 与设置框预填值 | PASS：两者均为 `https://api.klong.lat/v1`；只填 Key 即视为已配置 |
| 未覆盖 | — | 没有用真实 Key 打过 `api.klong.lat`（无凭证）；该服务的 CORS 行为未知，仍受 K3 约束 |

### 已知问题与限制

- 新增 K11（用户手动保存过自定义 Base 的浏览器不会被覆盖）。

---

## v0.2 — 2026-09-22（生图队列：拍照不等生成）

### 背景

v0.1 的生图（AI 重绘）是「点一下 → 全屏等待 20–60s」，与拍摄冲突。本版把生图拆成后台任务：拍照只管拍，生图交给队列。

### 改动点

1. **拍照不被阻塞**（`capture()`）：快门路径只做「canvas 编码 → 写 IndexedDB 胶卷 → `GenQueue.add()` 同步入队」，全路径无 AI 调用、无 AI await。新增 `async function aiRedrawCore(blob,style,strength)` 作为唯一生图通道（修图页与队列共用，去掉 UI），修图页的 `aiRedraw()` 变成它的 UI 包装。
2. **后台列表 + 入口徽标**：页头 ✨ 徽标显示「生成中 + 排队中」数量（生成中时脉冲动画），点开底部面板逐条显示 排队中（含位次）/ 生成中 / 已完成 / 失败，失败条目带可读原因 + 重试 / 移除；面板顶部实时汇总「并发上限 4 · 生成中 n · 排队 n · 已完成 n · 失败 n」。新增第 5 个 tab「✨ AI 相册」作为归档入口。
3. **并发上限 4 + FIFO**：`GenQueue{MAX:4, pump(), run()}`；`pump()` 是同步 while 循环补齐空位（内部无 await，不是串行等待），任务队列数组按入队顺序取（先进先出），任务结束（成功或失败）后都调 `pump()` 补位。
4. **完成即归档**：`archiveResult(task,outBlob)` 把结果写成 `{kind:'ai'}` 记录入库并进 `AI_ALBUM`，胶卷只放原片（`PHOTOS` 过滤 `kind!=='ai'`）；AI 相册点开可看大图 / 另存分享 / 删除 / 送去做拍立得。
5. **失败可重试、不卡队列**：失败任务标 `failed` + `humanAiErr()` 可读信息（含 CORS 提示），失败即让位给下一笔；`retry(id)` 重新排队，`drop(id)` / `clearFinished()` 清理。

### 三个坑的处理

| 坑 | 处理 |
|----|------|
| 刷新丢队列 | IndexedDB 升到 v2，新增 `queue` 对象仓（`DB.putTasks/tasks`）；入队/状态变化/结束时都写整表快照（快照含源图 blob，所以恢复后不依赖原片还在）；`init()` 里 `GenQueue.restore()`，把被刷新打断的 `running` 重新排队并立即 `pump()`，`done` 恢复成历史不再入队，`restore` 时裁掉超过 30 条的旧历史 |
| 对象 URL 泄漏 | 队列面板 / 胶卷 / AI 相册三处都维护「当前批次 URL 数组」，重渲染时先建新批次、挂完 DOM 再 revoke 旧批次（队列源码本身不造 URL，生命周期集中在一处）；大图关闭时先摘 `img.src` 再 revoke |
| 并发要真并起来 | `run()` 同步标 `running`、`active++`，把生图丢进 `(async()=>{...})()` 后立即返回，不把 Promise 交给 `pump()`；实测并发峰值 = 4（页面侧 fetch 计数与 stub 计数一致） |

### 其他

- 取景页新增「拍完自动生图」开关 + 风格选择（状态存 localStorage），可在拍照前选风格、也可关掉只用修图页手动生图。
- 「清空全部数据」现在同时清 photos / queue 两个仓，并用 `GenQueue.reset()`（epoch 增量）让在飞的生成结果作废，避免清空后又被写回一张。
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

### 已知问题与限制

| # | 问题 | 影响 | 计划 |
|---|------|------|------|
| K1 | 无 Service Worker，首次打开页面需网络 | 弱网下二次加载慢 | v0.3：SW 预缓存（注意 SW 需同源独立文件，需拆出或用构建步骤） |
| K2 | 长按删除依赖 contextmenu，部分安卓浏览器长按弹出系统菜单 | 删除入口不稳定 | v0.3：胶卷改为选中后出删除按钮 |
| K3 | AI 直连受目标服务 CORS 限制，OpenAI 官方端点可用、部分兼容网关不行 | 部分 Key 无法体验 AI 重绘 | 正式版走网关（见 p0-plan D1）；原型不改 |
| K4 | 无 web app manifest 与图标，iOS 添加主屏无专属图标 | 体验细节 | v0.3：加 manifest + data-URI 图标 |
| K5 | 照片以原始分辨率存 IndexedDB，连续拍大量照片占用增长快 | 存储压力 | v0.3：缩略图 + 原图上限管理/LRU |
| K6 | 场景识别为手动选择（正式版为 ML Kit 自动识别） | 引导体验打折 | 属设计内取舍，正式版解决 |
| K7 | 拍立得注记输入框高度固定，长文案折行在低分屏可能溢出 | 边角体验 | 随下一版 UI 调整 |
| K8 | 队列快照里带源图 blob（为了让刷新恢复不依赖原片），与胶卷原片在 IndexedDB 里各存一份；在生成中刷新会多占一份原图空间 | 存储翻倍（仅未完成任务） | v0.3：快照只存 `photoId`，恢复时回查 photos 仓 |
| K9 | 生成中刷新页面 → 该任务重新排队，服务端可能已经出了一张图，属于重复生成（多花钱） | 极端情况多花一次生图费用 | 正式版用内容 hash 做幂等键（见 p0-plan A4）；原型接受 |
| K10 | 大量快速重渲染时，被提前 revoke 的缩略图会产生 `net::ERR_FILE_NOT_FOUND` 控制台噪声（实测 0 次元素仍在 DOM 的加载失败，纯噪声） | 仅控制台噪声 | 若以后觉得吵，改成延迟 ~1s 回收旧批次 |
| K11 | 用户显式保存过「既不是旧默认、也不是新默认」的自定义 Base 时不会被覆盖（含自建网关）；而保存值**恰好等于旧默认** `https://api.openai.com/v1` 的浏览器会被切到新默认（无法区分「随手沿用默认」与「手打 openai」，按后者更少见处理） | 想故意继续用 openai 官方地址的人需在设置里重新填一次 | 预期行为（不覆盖用户显式配置）；若需要统一，后续加「重置为默认」按钮 |
| K12 | `ImageCapture.takePhoto` 的支持**按浏览器/版本而异**：iOS 26.6 Safari **实测支持**（真照约 3.1–3.8 MB，为抓帧的 5.6×）；更旧的 iOS 版本及其他 WebView 未逐一验证 | 旧设备仍可能只拿到抓帧 | 已改为**运行时能力探测 + 一次性回落**，不按 UA 判断；取景信息条如实显示本机走的是哪条路 |
| K13 | `takePhoto()` 在部分设备/视频流上会失败（已自动回落抓帧并把 `cam.still` 置 false，本次会话不重试）；降级只在取景信息条可见 | 用户可能不知道这张图是抓帧 | 可考虑首次降级时弹一次提示；正式版相机拿回完整控制后自然消失 |
| K14 | `applyConstraints` 的 3840×2160 只是「理想值」，实际分辨率由设备决定；部分设备不支持 `focusMode:'continuous'`，失败静默 | 提升幅度因机而异 | 信息条已如实显示实际分辨率；真机实测后再决定是否需要降级策略 |
| K15 | **切后台/锁屏时页面被挂起**（iPhone iOS 26.6 实测：计时器最长 51.5 s 未跳）→ 队列只在页面活跃时推进，「后台生图」实际含义是「不挡拍照」，不是「切走还在跑」 | 切到相机 App 拍照期间，队列会暂停；回前台后自动补跑 | 已实现回前台自动续跑；**根治要把生图改成「服务端任务 + 轮询」**（ImgX Studio 的 ADR 0002 统一异步 正是这个形状），这样挂起也不影响服务端生成 |
| K16 | 浏览器标签页下 iOS 不支持 Notification / Web Push（需先「添加到主屏」为 standalone 才可能出现）；屏幕方向锁定、震动 iOS 一直不提供 | 想推送提醒/锁屏体验会失望 | 需要时先把页面加到主屏再复测（`tools/ios-probe.html` 可直接重跑）；推送不是当前必需 |
| K17 | 缩略图是**列表专用的降级图**，点开大图/送去做拍立得/入队生图仍用原图（3 MB 级），这几条路径的耗时未优化 | 打开大图、生图上传的等待时间不变 | 大图按需解码（已用 `decoding="async"`）；后续可给大图加 loading 占位与进度反馈 |
| K18 | 缩略图额外占存储（实测约 30 KB/张，相对原图约 3%）；本版之前的照片首次打开会触发后台回填（一次性） | 存储略增；首次打开有后台解码活动 | 可接受；如需要可在设置里提供「清理缩略图」（清后自动重建） |

### v0.7 候选（按优先级，原列为 v0.6 候选，v0.6 只做了缩略图与增量渲染，故整体顺延）

1. 出游实测反馈修复（真实手机 + 真实 Key 跑一轮生图队列）
2. K5/K8：缩略图与原图上限管理，队列快照只存 photoId
3. 胶卷多选 → 批量入队生图（一次挑 5 张排队）+ 队列手动暂停/继续
4. K1 离线缓存 + K4 manifest/图标 → 真正「装进主屏」
5. 生图风格 prompt 模板抽成可编辑（为 D1 prompt 模板引擎收集调参数据）

---

## v0.1 — 2026-09-22（出行原型）

### 功能清单

- **取景**：getUserMedia 后/前摄切换、三分/黄金螺旋网格（随场景切换）、电子水平仪（iOS 需手势授权）、8 场景构图提示卡、快门闪白
- **黄金时刻**：本地天文计算（太阳高度 -4°~+6° 为黄金窗口），倒计时与晨/昏窗口显示，全离线
- **胶卷**：IndexedDB 本机存储，多选、缩略图、长按删除（contextmenu）
- **拍立得工坊**：三种胶片（600/SX-70/宽幅）偏色与比例、Canvas 颗粒（pattern 平铺）+暗角、日期戳、手写注记（模板随机 + 手输）、10 秒显影动画、Web Share / 下载保存
- **主题修图**：5 个本地滤镜（canvas ctx.filter + 叠色，强度混合）离线可用；可选配置 API Base/Key/Model 直连 `images/edits` 调 gpt-image-2 真重绘（b64/url 双兼容），失败降级提示
- **设置**：定位/手填经纬度、AI 配置与连通测试、数据清空

### 验证情况

- HTML 结构校验通过（无未闭合标签）；JS `node --check` 通过
- 太阳算法四城市实测：成都/北京/赫尔辛基/三亚，日出日落与参考值偏差 <11 分钟
- 线上部署：GitHub Pages，HTTPS 200

### 已知问题与限制

| # | 问题 | 影响 | 计划 |
|---|------|------|------|
| K1 | 无 Service Worker，首次打开页面需网络 | 弱网下二次加载慢 | v0.2：SW 预缓存（注意 SW 需同源独立文件，需拆出或用构建步骤） |
| K2 | 长按删除依赖 contextmenu，部分安卓浏览器长按弹出系统菜单 | 删除入口不稳定 | v0.2：胶卷改为选中后出删除按钮 |
| K3 | AI 直连受目标服务 CORS 限制，OpenAI 官方端点可用、部分兼容网关不行 | 部分 Key 无法体验 AI 重绘 | 正式版走网关（见 p0-plan D1）；原型不改 |
| K4 | 无 web app manifest 与图标，iOS 添加主屏无专属图标 | 体验细节 | v0.2：加 manifest + data-URI 图标 |
| K5 | 照片以原始分辨率存 IndexedDB，连续拍大量照片占用增长快 | 存储压力 | v0.3：缩略图 + 原图上限管理/LRU |
| K6 | 场景识别为手动选择（正式版为 ML Kit 自动识别） | 引导体验打折 | 属设计内取舍，正式版解决 |
| K7 | 拍立得注记输入框高度固定，长文案折行在低分屏可能溢出 | 边角体验 | 随下一版 UI 调整 |

### v0.2 候选（按出游反馈优先级排序）

1. 出游实测反馈修复（优先级最高，等 9/底出行回来）
2. K1 离线缓存 + K4 manifest/图标 → 真正「装进主屏」
3. K2 胶卷管理（删除按钮 + 全选 + 存储占用显示）
4. 拍立得：多选拼接照片墙（对应设计稿 C5 的原型验证）
5. AI 重绘：prompt 模板抽成可编辑（为 D1 prompt 模板引擎收集真实调参数据）

---

> 迭代约定：改动 index.html 必须同步更新本日志；版本号在页头 `TRIP PROTOTYPE vX.Y` 同步修改。
