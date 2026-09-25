# 汇盛支付统一 Demo

GitHub 仓库：[jeffcity/huisheng-pay-demo](https://github.com/jeffcity/huisheng-pay-demo)（原 huisheng-pay-platform）。在线评审：[汇盛支付统一 Demo](https://jeffcity.github.io/huisheng-pay-demo/)。仓库更名不改变本地项目目录；本地仍在原「平台端」目录维护三端源码，不另建副本。

唯一评审入口：仓库根 `index.html`，本地预览 `http://127.0.0.1:4174/`。平台端、租户端、商户端在顶部切换，任一时刻只运行当前端；切换销毁前一端页面，未保存的表单不会保留。

三端最新来源和停止维护范围见 [三端版本与维护入口](三端版本与维护入口.md)。后续只维护本统一 Demo 仓库，不再独立维护或发布旧租户/商户 Demo。

## 一个项目、一个发布文件

- 三端源码已归入本仓库；构建不读取相邻「租户端」「商户端」目录，无子模块、软链接或额外端口。
- `npm run build` 自动生成根 `index.html` 和相同内容的 `dist/index.html`。发布目录只有这一个 HTML，可单独复制、双击打开或部署在 GitHub Pages 子路径。
- 所有业务源、React 和 Arco 代码/样式均打包内联。未选中的端仅作为静态数据，不创建页面、不执行脚本。
- 少量历史页面的图标/字体仍使用 CDN；离线时使用原有回退，不新增业务依赖。
- 不手改生成文件。保留可搜索的源码，方便维护和 Git 审查。

## 以后改哪里

| 范围 | 唯一可编辑源 |
|---|---|
| 顶部三端切换 | `src/unified.html` |
| 平台端壳 / 页面 | `src/` / `public/legacy/sources/` |
| 租户端壳 / 页面 | `surfaces/tenant/src/` / `surfaces/tenant/public/legacy/sources/` |
| 商户端 | `surfaces/merchant/demo.html` |
| 打包 / 校验 | `scripts/build-unified.mjs` / `scripts/check.mjs` |

相邻旧独立项目保留作迁移前参考，后续三端 Demo 修改统一在本仓库进行，不再两处维护。

**2026-09-25：旧独立租户端、商户端 Demo 正式停止维护。** 包括 `raw/_delivery/huisheng-domain-20260814/{tenant,merchant}` 的旧工作副本。它们仅保留历史资料；本地旧端口和旧在线独立 Demo 不代表当前统一版。后续修改、测试、打包及发布全部从本仓库进行，不再向旧仓库双写或单独发布。

租户端已核对并导入旧工作副本的最新 main 提交 `e6ec8d7`：商户管理、两条 2FA 登录流程、账户补单限制。首次整合误用的旧目录不再作为更新来源。构建仍只读取本仓库源码，GitHub 不依赖这些历史目录。

```sh
npm ci
npm run dev       # 构建后在 4174 预览；源码修改自动重建并刷新
npm run build     # 单文件产物
npm run check     # 重建、平台/租户测试、三端完整性门禁
npm run smoke     # 本机 Chrome：单文件、切端、子目录和离线验证
```

推送时提交本仓库源码、package-lock、构建脚本和生成的根 `index.html`。GitHub Actions 从当前仓库执行 npm ci → npm run check → npm run smoke，全部通过后发布 dist，不需要启动三个服务。dist 不提交。需求资料继续使用既有三端需求管理目录。
