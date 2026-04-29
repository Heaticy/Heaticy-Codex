# 审计报告 — 2026-04-29

> Language: zh-CN | Timezone: Asia/Shanghai

## 元数据
- 范围：全项目
- 维度：全部
- 触发：user
- 基线：`AGENT.md`, `README.md`, `LOG.md`, `package.json`
- 扫描文件数：66
- 时间：2026-04-29T00:01:08+08:00

## 摘要
- 发现：0 Critical，5 Warning，2 Info
- 验证：`npm test` 19/19 通过；`npm run check` 通过，包含 Vite 生产构建。

## Critical
- 无。

## Warning
- [SEC-01] `src/koa-app.js:47` — `runtime.readBody()` 在请求体超过 2 MB 后会 reject，但请求流结束前仍继续把后续 chunk 追加到 `body`。由于 `/api/login` 在认证前使用该路径，LAN 或公网暴露部署可能被迫持有任意大的请求体内存。建议记录超限状态，移除监听器或销毁 request/socket，并保证只 resolve/reject 一次。
- [SEC-02] `src/approvals.js:5` 和 `src/sessionManager.js:2573` — 高风险审批匹配对全权限终端过窄。`rm -fr`、`rm -r -f`、`find ... -delete`、`dd of=`、`.aws` 等凭据路径、包管理器脚本执行等未被识别为高风险，因此 `CODEX_FULL_ACCESS=true` 时可能被自动批准。建议用规范化后的命令分类替代小型正则列表，并为破坏性变体补充表驱动测试。
- [SEC-03] `src/routes/sessions.js:200` — `/api/health`、`/api/healthz` 和 `/api/metrics` 未认证即可访问，会暴露活动会话数、runner 数、bridge 状态、最近错误时间、turn 计数和审批决策计数。如果服务可被 localhost 之外访问，这些都是有用的运行态信息。建议默认要求认证，或通过显式环境变量/可信 CIDR 开启未认证观测。
- [BUG-01] `src/appServerBridge.js:358` — `shutdown()` 设置 `this.shuttingDown = true` 后从不复位。`restartRunner()` 会调用该路径，后续 app-server 退出会被当作预期关闭，错误事件被抑制。建议在启动新进程时复位该标记，或拆分永久服务关闭和 runner 重启语义。
- [PERF-01] `src/sessionManager.js:2918` — 会话列表每次刷新都会递归扫描所有 provider 历史目录，并完整解析每个 `.jsonl` transcript。Codex 历史增长后，页面加载和轮询会变成 I/O 受限。建议按 file path、mtime、size 建缓存；列表视图只解析元数据，完整消息仅在 `getHistoricalMessages()` 中加载。

## Info
- [TEST-01] 当前测试覆盖审批、历史消息规范化、runner、项目索引和构建检查，但缺少 Koa 路由安全边界集成测试。建议补充请求体超限中止、未认证 health/metrics 策略、跨源 POST 拒绝、WebSocket 认证/Origin 拒绝等用例。
- [QUAL-01] 本仓库没有既有 `.pipeline/` 架构/配置状态，因此本次审计以 `AGENT.md`、`README.md` 和 `LOG.md` 作为架构基线。若后续希望审计能比较架构差异，建议补充持久化的 `.pipeline/architecture.md`。

## 架构差异
- 本次审计未修改运行时代码架构。
- 新增生命周期产物：`.pipeline/audits/` 和 `.pipeline/log.yaml`。

## 建议动作
- 优先修复 `SEC-01`，因为它发生在认证前，且在暴露部署中利用成本低。
- 在依赖 full-access 模式下的记忆审批或自动审批前，先收紧审批风险分类。
- 明确观测端点是否允许公开访问，并把该决策写入配置和测试。
- 在历史会话继续增长前，为历史会话索引增加缓存。
