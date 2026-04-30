# Architecture Baseline — Heaticy-Codex 1.0.0 Open Source Release

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

## 追加计划：首个公开开源版本 1.0.0

### 目标
- 将项目整理为 `Heaticy-Codex` 首个公开开源版本 `1.0.0`。
- 保留 heaticy 品牌和标准 fork 致谢。
- 明确完全本地运行、不上传用户数据、不收集远程遥测。
- 确保电脑 Web 与手机 Web 的局域网访问路径清晰可靠。
- 用中英文 README、PRIVACY、SECURITY、CHANGELOG、release checklist 和 GitHub Release 草稿支撑公开发布。

### 相关边界
- 启动配置集中在 `.env`、`src/config.js`、`scripts/setup.mjs`、`scripts/dev-up.sh`、`scripts/service.mjs` 和 PM2 配置。
- 浏览器主入口应以 `WEB_PORT` 为准；后端 API 使用 `PORT`。
- 局域网访问主路径是 `HOST=0.0.0.0`，手机访问应说明 `http://<LAN-IP>:<WEB_PORT>/#/sessions`。
- 本地数据边界包括项目内 `data/`，用户目录 `~/.heaticy-codex/`，以及 Codex 自身 transcript 目录。
- README 截图资产放入 `docs/images/` 并纳入 git 管理，提交前需要压缩和隐私检查。

### 计划变更
- M6.1：开源身份、fork 致谢、`PRIVACY.md`、安全说明和 issue/PR 隐私提醒。
- M6.2：启动端口检测、占用端口提示、可用端口推荐，以及 LAN 访问路径文档。
- M6.3：中英文 README 重写，放置桌面和手机截图资产。
- M6.4：重建 `CHANGELOG.md`，新增 release checklist 和 GitHub Release notes 草稿。
- M6.5：最终测试、secret/privacy scan、图片链接和发布准备验收。

### 已实现结果
- 新增 `scripts/lib/ports.mjs` 和 `scripts/check-ports.mjs`，并接入 `scripts/setup.mjs`、`scripts/dev-up.sh` 和 `scripts/service.mjs`。
- 新增 `test/ports.test.js` 覆盖端口格式、占用检测和可用端口推荐。
- `README.md` 与 `README.zh-CN.md` 已重写为 1.0.0 公开版文档。
- 新增 `PRIVACY.md`、`docs/release-checklist.md`、`docs/releases/v1.0.0.md`。
- `CHANGELOG.md` 已重建为公开 1.0.0 release notes。
- 桌面与手机截图已压缩为 `docs/images/heaticy-codex-desktop.webp` 和 `docs/images/heaticy-codex-mobile.webp`。
- 最终验证通过：`npm test` 31 passed，`npm run check` passed，`git diff --check` passed。

## 追加计划：Codex-style `$skill` 补全

### 目标
- 在聊天 composer 中提供和 Codex 类似的 `$skill` 补全。
- 以移动端为主路径：输入框上方显示候选，点击插入 canonical skill 名。
- 桌面端补充键盘选择：上下键、Enter/Tab、Esc。
- 支持通用 alias，例如 `$hw:plan` 匹配并唯一归一化为 `$hypo-workflow:plan`。

### 相关边界
- 后端 skill catalog 需要从 Codex home 读取：优先 `CODEX_HOME`，默认 `~/.codex`。
- catalog 扫描范围为 `skills/**/SKILL.md`，包含 `.system`、普通 skill 和子 skill。
- 后端 API 必须认证后访问，避免无登录枚举本地路径。
- catalog 返回 `name`、`description`、`path`、`aliases`；`path` 是本机路径，仍属于登录后本地管理信息。
- 缓存策略为 `5s TTL + ?refresh=1`，避免输入过程中频繁扫盘。
- 前端补全只在当前光标 token 以 `$` 开头时显示，句中输入同样支持。
- alias 冲突时不自动归一化，避免发送前误改用户文本。

### 计划变更
- M7.1：新增 skill catalog 后端、frontmatter 解析、通用 alias、缓存和 `/api/skills`。
- M7.2：新增 composer 补全 UI、移动端点击选择、桌面键盘选择、候选过滤和替换。
- M7.3：新增发送前 alias 归一化、冲突保护、测试、构建验证和轻量文档。

### 待确认
- M7 为单个 milestone，内部用 `M7.1-M7.3` 承载小数点步骤。
- 规划确认后再进入执行。

### 已实现结果
- 新增 `src/skillsCatalog.js`，负责扫描 `CODEX_HOME || ~/.codex` 下的 `skills/**/SKILL.md`，解析 frontmatter，生成 canonical name 和通用 alias。
- 新增认证后的 `/api/skills`，支持 `?refresh=1`，默认 5 秒缓存。
- 新增 `web/src/lib/skill-completion.js`，封装当前 `$` token 检测、候选过滤、插入替换和 alias 归一化。
- `web/src/App.vue` 登录后加载 skill catalog，并在发送前归一化唯一 alias。
- `web/src/components/ChatView.vue` 新增移动端优先的 composer 上方候选列表，最多 5 条，支持点击和桌面键盘选择。
- README 中补充 `$skill` 补全来源、移动端用法和 alias 行为。
