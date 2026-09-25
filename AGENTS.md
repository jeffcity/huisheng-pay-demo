# 统一 Demo 维护规则

- 2026-09-25 用户确认：旧独立「租户端」「商户端」Demo 停止维护，包括 raw/_delivery 中的旧工作副本。三端改动只在本仓库完成；不要从旧 GitHub项目/租户端 目录重新覆盖当前源码。
- 租户最新导入基线为 huisheng-pay-tenant 提交 e6ec8d7c9120ec0a028d9a28862b207d1e203a08，来自 raw/_delivery/huisheng-domain-20260814/tenant；已包含商户管理、2FA 登录与账户补单限制。该目录现在仅留作历史参考，不是构建依赖。

- 本仓库维护汇盛支付三端统一 Demo。唯一评审入口是生成的根 index.html，发布产物是同内容的 dist/index.html。
- 用户明确要求单文件交付与按需切端：仅挂载一个业务端 iframe；切换销毁旧端，不允许同时运行或预加载三端。
- 顶部壳只改 src/unified.html；平台端只改 src/ 和 public/legacy/sources/；租户端只改 surfaces/tenant/src/ 和 surfaces/tenant/public/legacy/sources/；商户端只改 surfaces/merchant/demo.html。
- 可编辑业务源保持独立、可检索的真实 HTML，不做 base64。只有构建生成的交付文件允许内联；禁止手改生成物。
- 不依赖相邻旧项目、机器绝对路径、软链接或额外端口；不复制回旧项目形成双写。
- 修改后依次运行 npm run build、npm run check。运行时验证使用 npm run smoke（需本机 Chrome）。
- 推送 main 后 Actions 重新检查并发布 dist，不绕过检查。未获明确授权不主动推送/部署。
- 不启动 Obsidian，保护已有改动。
