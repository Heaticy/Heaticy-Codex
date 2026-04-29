# Architecture Baseline — Heaticy Codex Audit Fixes

## 项目结构
- 后端：Node.js ESM + Koa，入口为 `src/server.js`，应用组装在 `src/koa-app.js`。
- 路由：`src/routes/*.js` 负责 auth、session、history、maintenance、config、WebSocket。
- 会话：`src/sessionManager.js` 管理 live session、历史 session、Codex app-server/json_exec/PTY runner。
- Runner：`src/runners/*.js` 封装 Codex app-server、Codex SDK json_exec、PTY provider。
- 前端：Vue 3 + Vite，入口 `web/src/App.vue`，会话列表与聊天组件位于 `web/src/components/`。
- 持久化：项目本地 `data/*.json` 存自定义会话名和归档状态；用户目录 `~/.heaticy-codex/` 存审批、审计和项目索引；Codex transcript 读自 `config.codexSessionsDir`。

## 当前边界
- `/api/login` 在认证前读取请求体，是请求体大小防护的关键边界。
- `/api/health` 用作轻量探活，保持未认证。
- `/api/healthz` 和 `/api/metrics` 暴露 runner、bridge、turn、approval 等运行态信息，现已收敛到认证后访问。
- `AppServerBridge` 管理 app-server 子进程及 stdio/ws JSON-RPC 生命周期。
- 历史会话列表与清理都基于扫描 `.jsonl` transcript；保留策略、报告状态、定时清理与手动清理 API 都收敛在 `SessionManager`。

## 已实现变更
- `runtime.readBody()` 现在按字节限制请求体，超限后停止累积并通过全局错误处理返回 `413 Payload Too Large`。
- observability endpoint 权限已调整为：`/api/health` public，`/api/healthz` 与 `/api/metrics` authenticated。
- `AppServerBridge` 在新进程启动时复位 `shuttingDown`，并对预期关闭的旧进程/旧 WebSocket 做显式标记，避免 restart 后误吞异常。
- `SessionManager` 新增历史会话保留策略、启动后延迟清理、定时清理、维护报告状态、warning 缓冲与手动清理入口。
- 新增 `src/routes/maintenance.js` 和前端会话列表维护条，前端可查看最近清理时间、删除/失败数量、最近 warning，并触发手动清理。

## 不在本轮范围
- 不修审计 SEC-02：审批高风险命令分类。
- 不改变 Codex 执行模式和 provider 抽象。
- 不删除项目分组索引。

## 追加计划：移动端底部定位与 Skill 补全

### 目标
- 修复移动端打开长会话时可见的顶部到尾部滚动过程，让历史消息加载完成后直接落在底部。
- 增加 Codex 风格 `$` skill 补全，支持 canonical skill 名和短别名匹配。

### 相关边界
- 前端会话打开与滚动控制集中在 `web/src/App.vue` 和 `web/src/components/ChatView.vue`。
- 当前 `ChatView` 通过 `openToken`、message watcher 和 `scrollToBottom()` 管理底部定位；移动端需要避免 momentum/smooth scroll 造成的可见滚动。
- skill discovery 应落在后端路由层，前端只消费候选项并处理输入框交互。
- 后端可基于 `config.codexHome` 或环境中的 Codex home 推导 `~/.codex/skills`，并解析 `SKILL.md` front matter。

### 计划变更
- M6：调整移动端强制底部定位策略，历史加载完成后一次性显示在底部，保留 live pinned-bottom 语义。
- M7：新增认证后的 skill discovery API，返回 canonical name、description、aliases 等补全元数据。
- M8：新增 composer `$` 补全 UI，支持触屏选择和键盘导航，插入 `$hypo-workflow:plan` 这类完整形式。
- M9：最终回归、文档与架构说明。
