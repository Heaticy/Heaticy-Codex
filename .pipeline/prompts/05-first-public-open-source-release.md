# M6 — First public open-source release 1.0.0

## 需求

- 将 Heaticy-Codex 整理为首个公开开源版本 `1.0.0`。
- 保留展示名 `Heaticy-Codex` 和 heaticy 品牌；包名、目录名、脚本命令中的名称继续使用 `heaticy-codex`。
- 按标准 fork 惯例尊重上游项目：在合适文档中保留上游致谢/来源说明，并说明本仓库是 heaticy 维护版本。
- 明确隐私和数据边界：项目完全本地运行，不上传用户数据，不收集远程遥测；说明本地 Codex transcript、审批记录、审计日志、项目数据、cookie/session 和局域网暴露边界。
- 做好启动体验：电脑 Web 和手机 Web 都能通过局域网 IP 加端口访问；`HOST=0.0.0.0` 是 LAN 主路径；`PORT` 和 `WEB_PORT` 必须可配置。
- 启动前必须处理端口占用：setup/dev/service 路径不能静默使用已占用端口；发现冲突时要告知用户，并推荐可用端口。
- 重写中英文 README，使两个版本都能独立说明项目用途、安装、启动、局域网访问、隐私边界、安全边界和可选高级部署。
- 使用用户提供的两张 UI 截图作为 README 文档资产：
  - 桌面横版图放在顶部界面预览区域。
  - 手机竖版图放在手机访问章节附近。
- 重建 `CHANGELOG.md`，删除旧内部历史，只保留公开 `1.0.0` 发布说明。
- 添加发布 checklist 和 GitHub Release notes 草稿。
- 更新 issue / PR 模板，提醒用户不要粘贴 `ACCESS_TOKEN`、`.env`、本地 transcript、私有路径、敏感日志或含秘密的截图。

## 实施计划

1. M6.1 开源身份与隐私基线
   - 检查 `package.json`、`LICENSE`、`SECURITY.md`、`CONTRIBUTING.md`、`.github/ISSUE_TEMPLATE/*`、`.github/pull_request_template.md`。
   - 保留 `package.json` 的 `private: true`，防止误发 npm；首版只面向 GitHub 源码开源。
   - 新增 `PRIVACY.md`，用中立、可执行的语言说明“完全本地、不上传”、本地读取/写入路径和局域网暴露含义。
   - 更新 `SECURITY.md`，强调强 `ACCESS_TOKEN`、局域网/私有网络部署、不要公网裸露，域名/反代/HTTPS 属于高级可选路径。
   - 更新 issue 和 PR 模板，加入隐私提醒。

2. M6.2 启动、端口与 LAN 可靠性
   - 抽出或新增端口检查逻辑，支持检测 `PORT` 和 `WEB_PORT` 是否可监听。
   - 在 `scripts/setup.mjs` 中校验端口占用；如果占用，展示冲突信息，自动推荐可用端口，并让用户确认后写入 `.env`。
   - 更新 `scripts/dev-up.sh` 或相关启动脚本，使它在启动前检测配置端口，不继续使用已占用端口。
   - 检查 `scripts/service.mjs` / PM2 相关路径，至少提供一致的 preflight 或清晰文档说明。
   - 确保 README 使用 `WEB_PORT` 作为浏览器入口端口，手机访问说明使用 `http://<LAN-IP>:<WEB_PORT>/#/sessions`。

3. M6.3 双语 README 与截图资产
   - 重写 `README.md` 和 `README.zh-CN.md`，优先讲清楚：它是什么、适合谁、完全本地、快速启动、电脑访问、手机 LAN 访问、常用命令、数据位置、安全边界、可选高级部署、开源说明。
   - 将用户提供的桌面截图保存为 `docs/images/heaticy-codex-desktop.webp`，作为顶部产品预览图。
   - 将用户提供的手机截图保存为 `docs/images/heaticy-codex-mobile.webp`，放在手机访问章节附近。
   - 如果当前环境无法直接保存附件图片，先在 README 中使用目标路径和 TODO 注释/占位说明，并在发布 checklist 中标记“替换为最终截图资产”。
   - 删除或替换旧的 `codex-web-terminal*.jpg` README 引用，避免混淆。

4. M6.4 发布物与仓库清理
   - 重建 `CHANGELOG.md`，只保留公开 `1.0.0` release notes，不保留旧 `0.2.0`、`0.3.0`、二周目/三周目内部历史。
   - 新增发布 checklist，例如 `docs/release-checklist.md`，覆盖 secrets、`.env`、`data/`、`logs/`、截图、README 双语一致性、端口检查、CI、tag、GitHub Release。
   - 新增 GitHub Release notes 草稿，例如 `docs/releases/v1.0.0.md`。
   - 检查 `.gitignore` 和公开文档，确保私有运行文件不会被建议提交。
   - 检查 `NGINX_MIGRATION.md`、`docs/codex-rollout.md` 等已有文档是否需要标记为高级/可选或从 README 主路径降级链接。

5. M6.5 最终验收
   - 运行 `npm test`。
   - 运行 `npm run check`。
   - 运行 `git diff --check`。
   - 对 tracked files 做轻量 secret/privacy scan，重点检查 `ACCESS_TOKEN`、`.env` 内容、本地 transcript、私有路径、敏感截图和不应公开的域名/IP。
   - 检查 README 图片路径、中英文互链、release checklist 和 GitHub Release notes 草稿。
   - 更新 `.pipeline/architecture.md` 和 `.pipeline/confirm-summary.md`，记录最终发布计划和验证结果。

## 预期测试

- `npm test` 通过。
- `npm run check` 通过。
- `git diff --check` 通过。
- setup 端口检测覆盖：
  - 端口格式无效时拒绝。
  - 端口被占用时不接受该端口。
  - 被占用时提示用户，并推荐可用端口。
  - 用户确认后 `.env` 写入推荐端口。
- dev 启动前检查覆盖：
  - 已占用的 `PORT` 或 `WEB_PORT` 不会被静默继续使用。
  - 错误信息说明冲突端口和可用替代端口。
- README 检查：
  - `README.md` 与 `README.zh-CN.md` 均说明完全本地、不上传。
  - 两份 README 均说明电脑访问和手机 LAN 访问。
  - 图片路径有效，alt 文案清晰。
- 隐私/安全检查：
  - `PRIVACY.md` 覆盖本地数据位置和不会上传的承诺。
  - `SECURITY.md` 不暗示公网裸露部署安全。
  - issue/PR 模板提醒不要公开 token、`.env`、transcript、私有路径、敏感日志或截图。
- 发布检查：
  - `CHANGELOG.md` 只包含公开 `1.0.0` 发布说明。
  - release checklist 和 GitHub Release notes 草稿存在且可执行。

## 预期产出

- `PRIVACY.md`
- `README.md`
- `README.zh-CN.md`
- `CHANGELOG.md`
- `SECURITY.md`
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/pull_request_template.md`
- `docs/release-checklist.md`
- `docs/releases/v1.0.0.md`
- `docs/images/heaticy-codex-desktop.webp`（如附件资产可落盘）
- `docs/images/heaticy-codex-mobile.webp`（如附件资产可落盘）
- `scripts/setup.mjs`
- `scripts/dev-up.sh`
- 如需要复用端口检测：新增 `scripts/lib/ports.mjs` 或等价小型 helper。
- 如需要测试端口逻辑：新增或更新 `test/*.test.js`。
- `.pipeline/architecture.md`
- `.pipeline/confirm-summary.md`
