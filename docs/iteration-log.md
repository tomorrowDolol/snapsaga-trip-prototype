# 迭代日志

记录每版改动、验证情况与已知问题。新版本请追加在最上方。

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
| K12 | iOS Safari（及部分 Android WebView）不提供 `ImageCapture.takePhoto`，这些环境仍走抓帧，画质受预览分辨率限制 | iPhone 用户体验不到本版收益 | 原型可选用 `<input type="file" capture>` 调系统相机（会离开页面，与队列交互需再设计）；根治在正式版原生相机（p0-plan B1） |
| K13 | `takePhoto()` 在部分设备/视频流上会失败（已自动回落抓帧并把 `cam.still` 置 false，本次会话不重试）；降级只在取景信息条可见 | 用户可能不知道这张图是抓帧 | 可考虑首次降级时弹一次提示；正式版相机拿回完整控制后自然消失 |
| K14 | `applyConstraints` 的 3840×2160 只是「理想值」，实际分辨率由设备决定；部分设备不支持 `focusMode:'continuous'`，失败静默 | 提升幅度因机而异 | 信息条已如实显示实际分辨率；真机实测后再决定是否需要降级策略 |

### v0.5 候选（按优先级，原列为 v0.4 候选，v0.4 只做了真拍照，故整体顺延）

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
