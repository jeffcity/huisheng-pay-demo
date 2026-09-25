# 项目边界与单文件迁移

## 2026-09-25 租户版本纠正与停止独立维护

- 首次整合使用 GitHub项目/租户端 的旧副本，漏掉其他任务在 raw/_delivery/huisheng-domain-20260814/tenant 的更新。已按提交 e6ec8d7c9120ec0a028d9a28862b207d1e203a08 将 merchants/login/system 三个源完整导入，并保留单文件读源与 srcdoc 路由适配。
- 复用最新租户静态测试和完整商户交互回归；新增统一文件里的登录/补单限制验证，防止“能打开但内容陈旧”。验证顺序：重现旧筛选仍存在 → 导入 → build/check → 浏览器行为与源文件一致性核对。
- 用户确认旧独立租户端与商户端 Demo 停止维护；包括 GitHub项目 下旧目录和 raw/_delivery 下旧工作副本。只保留历史资料，不删除、不自动推送或停用远端服务。
- 唯一维护位置为本仓库 surfaces/tenant 与 surfaces/merchant；历史目录添加迁移指引，不建立同步服务、软链接或跨仓库打包依赖。

原平台端仓库升级为三端统一 Demo。保留平台 React + Arco 架构，租户 React 壳与五个业务源迁入 surfaces/tenant/，商户总 Demo 源迁入 surfaces/merchant/demo.html。后续以本仓库为三端 Demo 唯一维护位置，旧独立项目不再是当前统一入口的数据来源。

## 设计与构建契约

- 对齐蓝盛顶部导航：汇盛支付统一 Demo → 平台端 / 租户端 / 商户端。
- src/unified.html 生成顶层导航和一个活跃 iframe。每端文档存储在不可执行的 JSON 数据块中，仅选中时解析挂载；离开即卸载，不保留未保存表单。
- scripts/build-unified.mjs 在本仓库编译两个 React 壳，将 JS/CSS、真实业务源和商户页面内联成单文件。业务源保持可检索，不编码 base64。
- index.html 与 dist/index.html 均为生成物。GitHub Actions 沿用单仓库 npm ci/check/Pages 流程。
- 顶层 hash 为 platform / tenant / merchant；业务路由隔离在 iframe，租户 srcdoc 的 history 改写有安全回退。

## 实施与验证计划

1. 迁入当前租户/商户源码（不含依赖目录、Git 元数据或旧构建物），保留原业务内容和已删除的登录帮助按钮。
2. 增加顶部切换与单活跃端挂载，统一打包/检查及 Pages 发布契约。
3. 执行 build → check → smoke；验证导航、钱包弹窗、卸载、键盘/前进后退、离线文件和子目录托管。
4. 更新 4174 本地预览，不主动推送远端。

旧独立项目未删除，可从 Git 历史恢复；回滚时需同步恢复入口和构建配置。

## 历史外部依赖

平台 channels / login / system / tenants 与租户 system 的 lucide 图标和 Google Fonts CDN 保持原样；离线时字体/图标回退。本次不改变支付接口、真实资金、权限或生产配置。需求资料继续使用原三端需求管理和顶层业务设计目录。
