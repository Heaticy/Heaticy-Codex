# Heaticy-Codex

[English](./README.md) | 简体中文

把你电脑上的本地 `codex` 会话放到浏览器里用，也可以在同一局域网的手机浏览器里打开。

Heaticy-Codex 是由 heaticy 维护的 [codex-cc-web-terminal](https://github.com/SZZH/codex-cc-web-terminal) fork。本仓库专注于本地优先的 Codex 工作区：电脑上运行，电脑浏览器和手机浏览器都能访问。

应用运行在你自己的机器上。Heaticy-Codex 不会把你的 prompt、transcript、审批记录、审计日志或项目数据上传到任何 Heaticy-Codex 服务。

## 界面预览

<p align="center">
  <img src="./docs/images/heaticy-codex-desktop.webp" alt="Heaticy-Codex 电脑浏览器界面，展示已保存的 Codex 会话" width="920" />
</p>

## 前置要求

- Node.js 22+
- 已安装 `codex` 命令，并且能在终端直接运行

## 快速开始

```bash
git clone https://github.com/SZZH/heaticy-codex.git
cd heaticy-codex
npm run setup
```

`npm run setup` 会检查环境、写入 `.env`、确认 `PORT` 和 `WEB_PORT` 没有被占用、按你的选择安装依赖，并可直接启动开发服务。

手动配置：

```bash
cp .env.example .env
# 修改 ACCESS_TOKEN、PORT、WEB_PORT、HOST
npm install
npm run dev:up
```

电脑打开：

- 前端入口：`http://127.0.0.1:<WEB_PORT>/#/sessions`
- 后端健康检查：`http://127.0.0.1:<PORT>/api/health`

## 手机局域网访问

<p align="center">
  <img src="./docs/images/heaticy-codex-mobile.webp" alt="Heaticy-Codex 手机浏览器局域网访问界面" width="300" />
</p>

1. `.env` 保持 `HOST=0.0.0.0`。
2. 设置你自己的 `WEB_PORT`，例如 `WEB_PORT=5206`。
3. 用 `npm run dev:up` 或 `npm run service:start` 启动。
4. 手机连接同一个 Wi-Fi，打开 `http://<你的电脑局域网IP>:<WEB_PORT>/#/sessions`。
5. 使用 `ACCESS_TOKEN` 登录。

`PORT` 是后端 API 端口，`WEB_PORT` 是浏览器访问入口端口。两个端口都可以自己设置，setup 和启动脚本会在使用前检查端口是否被占用。

## 常用命令

```bash
npm run setup          # 交互式配置，含端口检查
npm run dev            # 前台开发模式
npm run dev:up         # macOS/Linux 后台开发模式
npm run dev:down       # 停止后台开发进程
npm run service:start  # PM2 服务模式
npm run service:status # PM2 状态和健康检查
npm run check          # 语法检查和前端构建
npm test               # 后端/单元测试
```

## 本地数据与隐私

Heaticy-Codex 是本地优先的：

- 从你的本地 Codex home 读取 Codex 会话 transcript。
- 项目自身状态写在项目内 `data/` 和用户目录 `~/.heaticy-codex/`。
- 持久化审批规则写在 `~/.heaticy-codex/approvals.json`。
- 审计日志追加写入 `~/.heaticy-codex/audit.log`。
- `.env`、`data/`、`logs/`、`.codex`、`.plan-state`、`web/dist/` 已被 git 忽略。

完整数据边界见 [PRIVACY.md](./PRIVACY.md)。

## 安全说明

- 一定要设置强 `ACCESS_TOKEN`。
- 只在你控制的网络里使用 `HOST=0.0.0.0`。
- 不要把服务直接裸露到公网；如果要用域名访问，请自行配置 HTTPS、额外认证和网络访问控制。
- `GET /api/health` 保持公开用于探活，`/api/healthz` 和 `/api/metrics` 需要登录。
- 高风险 Codex 审批请求始终需要人工确认。

漏洞报告和部署边界见 [SECURITY.md](./SECURITY.md)。

## 可选高级部署

PM2/service 模式：

```bash
npm run service:start
npm run service:status
npm run service:logs
```

域名、HTTPS、反向代理属于可选高级部署。建议先跑通本地和局域网 IP 加端口访问，再按你自己的网络环境加代理和安全控制。

## 开源说明

- 版本：`1.0.0`
- License：[MIT](./LICENSE)
- 隐私：[PRIVACY.md](./PRIVACY.md)
- 安全：[SECURITY.md](./SECURITY.md)
- 贡献：[CONTRIBUTING.md](./CONTRIBUTING.md)
- 行为准则：[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

本项目 fork 自 [codex-cc-web-terminal](https://github.com/SZZH/codex-cc-web-terminal)，并作为 Heaticy-Codex 维护。
