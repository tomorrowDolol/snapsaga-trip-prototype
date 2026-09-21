# SnapSaga 出行原型（v0.1）

「拾光 SnapSaga」Flutter App 的**网页体验原型**——在正式开发前，用手机浏览器真实体验 P0 核心功能。

**打开方式**：手机浏览器访问 https://tomorrowdolol.github.io/snapsaga-trip-prototype/ （需 HTTPS，浏览器才允许调用相机）

- 构图网格（三分/黄金螺旋）+ 电子水平仪 + 黄金时刻倒计时：全离线
- 胶卷：照片存本机 IndexedDB，不上传
- 拍立得工坊：白框/颗粒/日期戳/手写注记/显影动画，保存或系统分享
- 主题修图：5 个本地滤镜离线可用；可选填自己的 API Key 调 gpt-image-2 真重绘（Key 只存本机）

单文件应用（index.html），无构建、无依赖。对应产品设计稿与 P0 落地计划见主项目仓库。
