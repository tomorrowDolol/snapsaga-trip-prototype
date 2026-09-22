# 拾光 SnapSaga

> 出门玩的时候，人人都能拍出会讲故事的照片。
> Flutter 移动端 App（规划）· 现阶段为网页出行原型 + 设计文档。

## 快速入口

| 内容 | 位置 |
|------|------|
| 📱 **出行原型（线上可用）** | https://tomorrowdolol.github.io/snapsaga-trip-prototype/ |
| 🎨 产品设计稿（交互 HTML，可在线打开） | [docs/design-v0.1.html](docs/design-v0.1.html) · [在线版](https://tomorrowdolol.github.io/snapsaga-trip-prototype/docs/design-v0.1.html) |
| 🗓 P0 落地计划（8 周 WBS/验收门槛/风险） | [docs/p0-plan.md](docs/p0-plan.md) |
| 🔁 迭代日志（版本记录 / 已知问题 / 下一步） | [docs/iteration-log.md](docs/iteration-log.md) |

> 当前原型 v0.2：拍照与 AI 生图解耦——按快门只存胶卷，生图进后台队列（最多 4 并发，先入先跑），完成后归档到「AI 相册」。

## 目录结构

```
├── index.html            # 出行原型（单文件应用，GitHub Pages 从根路径部署）
├── docs/
│   ├── design-v0.1.html  # 产品设计稿：产品定位 / 四大模块 / 架构 / Prompt 策略 / 路线图
│   ├── p0-plan.md        # P0 落地计划：技术决策 / 里程碑 Gate / WBS / 风险登记簿
│   └── iteration-log.md  # 迭代日志：每版记录、已知问题、下一步候选
├── tools/
│   └── check_gen_queue.mjs  # 开发用验证脚本（零依赖）：从 index.html 抽真实队列源码跑调度/持久化断言
└── README.md
```

## 本地验证

```bash
python3 -c "..."                  # 1. HTML 标签闭合（html.parser）
# 2. 抽出全部 <script> 跑 node --check
node tools/check_gen_queue.mjs    # 3. 生图队列：并发 4 / FIFO / 失败重试 / 刷新恢复 / 归档
```

`tools/` 里的脚本只是开发验证工具，不是运行时依赖，不影响「单文件原型」这条约束。

## 如何迭代

1. 原型是**单文件** `index.html`（无构建、无依赖），改完提交 push 即可
2. GitHub Pages 自动重新部署，**约 1 分钟后线上生效**，手机刷新即见
3. 每次改动请同步更新 `docs/iteration-log.md`（版本号、改动点、已知问题）
4. 移动端验证：原型需 HTTPS 环境才能调用相机（Pages 天然满足）；本地调试可用 `python3 -m http.server` 配合浏览器 localhost，或任意静态托管

## 正式版路线

原型验证体验后，按 `docs/p0-plan.md` 推进 Flutter 正式版（相机引导 / 拍立得 / 主题修图走 gpt-image-2 网关， comic 为 P1）。正式版代码预计落在本仓库 `app/` 目录，原型保留在根路径继续当体验入口与设计对照。
