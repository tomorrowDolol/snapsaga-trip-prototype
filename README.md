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

## 目录结构

```
├── index.html            # 出行原型（单文件应用，GitHub Pages 从根路径部署）
├── docs/
│   ├── design-v0.1.html  # 产品设计稿：产品定位 / 四大模块 / 架构 / Prompt 策略 / 路线图
│   ├── p0-plan.md        # P0 落地计划：技术决策 / 里程碑 Gate / WBS / 风险登记簿
│   └── iteration-log.md  # 迭代日志：每版记录、已知问题、下一步候选
└── README.md
```

## 如何迭代

1. 原型是**单文件** `index.html`（无构建、无依赖），改完提交 push 即可
2. GitHub Pages 自动重新部署，**约 1 分钟后线上生效**，手机刷新即见
3. 每次改动请同步更新 `docs/iteration-log.md`（版本号、改动点、已知问题）
4. 移动端验证：原型需 HTTPS 环境才能调用相机（Pages 天然满足）；本地调试可用 `python3 -m http.server` 配合浏览器 localhost，或任意静态托管

## 正式版路线

原型验证体验后，按 `docs/p0-plan.md` 推进 Flutter 正式版（相机引导 / 拍立得 / 主题修图走 gpt-image-2 网关， comic 为 P1）。正式版代码预计落在本仓库 `app/` 目录，原型保留在根路径继续当体验入口与设计对照。
