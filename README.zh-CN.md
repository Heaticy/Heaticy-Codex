# Heaticy Codex

[English](./README.md) | 简体中文

只做一件事：把你电脑上的 `codex` 会话放到浏览器（含手机）里用。

这个仓库是一个由 heaticy 维护和命名的开源 fork，基于原有 Codex Web Terminal 做了重命名，并针对局域网与反向代理部署进行了调整。

当前仅支持 **Codex**。

## Codex 运行方式

- App-server 默认改为通过 **stdio** 运行 `codex app-server`，正常启动不再监听 `127.0.0.1:8777`。
- 旧 websocket transport 可临时用 `CODEX_APP_SERVER_TRANSPORT=ws` 保留；该模式继续读取 `CODEX_APP_SERVER_LISTEN_URL`，启动时会打印废弃警告。
- 当 `CODEX_APP_SERVER_ENABLED=false` 时，`json_exec` fallback 改走 `@openai/codex-sdk`。

## 审批流

Codex 的命令执行、文件修改、权限提升请求会推到前端逐条确认。`CODEX_FULL_ACCESS=true` 只会继续自动允许非高危请求；高危请求始终需要人工确认。

持久化白名单位于 `~/.heaticy-codex/approvals.json`，审计日志追加写入 `~/.heaticy-codex/audit.log`。

## 运维接口

- `GET /api/healthz` 返回 bridge ready、runner 数量、最近错误时间。
- `GET /api/metrics` 暴露 Prometheus 文本指标，包括活跃会话、Codex turn 计数和审批决策计数。
- PM2 配置已加入每天 04:00 重启与 1G 内存上限重启。

## 示例截图

<p align="center">
  <img src="./docs/images/codex-web-terminal.jpg" alt="Heaticy Codex 手机界面截图 1" width="280" />
  <img src="./docs/images/codex-web-terminal2.jpg" alt="Heaticy Codex 手机界面截图 2" width="280" />
</p>

## 前置依赖

- Node.js 22+
- 已安装 `codex` 命令并可在终端直接运行

## 1 分钟本地跑起来

```bash
git clone https://github.com/SZZH/heaticy-codex.git
cd heaticy-codex
npm run setup
```

`npm run setup` 会交互式引导你完成：`.env` 配置、安装依赖、启动服务。

或手动执行：

```bash
cd heaticy-codex
cp .env.example .env
# 把 .env 里的 ACCESS_TOKEN 改成你自己的
npm install
npm run dev:up
```

打开：

- 前端（推荐）：`http://127.0.0.1:<WEB_PORT>/#/sessions`
- 后端直连：`http://127.0.0.1:<PORT>`

## 手机访问

### A. 同一 Wi-Fi

1. `.env` 确认：`HOST=0.0.0.0`
2. 手机打开：`http://你的电脑局域网IP:3211`
3. 用 `ACCESS_TOKEN` 登录

## 部署（PM2）

```bash
npm run service:start
npm run service:status
npm run service:logs
```

## 最常用命令

```bash
npm run dev            # 开发模式（前后端前台运行）
npm run dev:up         # 仅 macOS/Linux：后台启动开发服务
npm run dev:down       # 仅 macOS/Linux：停止后台开发进程
npm run check          # 快速自检
```

## 三个高频问题

1. `Cross-origin request rejected`
- 优先用 `npm run dev`（macOS/Linux 也可用 `npm run dev:up`）启动，不要手动拆开前后端起。

2. 前端端口打不开
- 先执行 `npm run dev`，再看端口：
```bash
# macOS/Linux
lsof -iTCP:<WEB_PORT> -sTCP:LISTEN -n -P

```

3. 手机提示“电脑未连接”
- 先确认电脑服务在线：`npm run service:status`
- 再确认网络路径正确：同 Wi-Fi，或你自己已经配置好的其他网络路径
- 如果你改过 `PORT`，手机访问地址也要用同一个端口。
- `npm run setup` 现在会把 `PORT` 和 `WEB_PORT` 一起写进 `.env`。
- 也可以临时覆盖：`WEB_PORT=xxxx PORT=yyyy npm run dev` 或 `npm run dev:up`。

## 开源说明

- 这是一个由 heaticy 维护的开源 fork
- [LICENSE](./LICENSE)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
