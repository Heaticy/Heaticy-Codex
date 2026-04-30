# Design Spec — Heaticy-Codex First Public Open Source Release

## 目标
- 将项目整理为首个公开开源版本 `1.0.0`。
- 保留 `Heaticy-Codex` 展示名和 heaticy 品牌，按标准 fork 惯例尊重并注明上游来源。
- 明确项目是完全本地运行：不上传用户数据，不收集远程遥测。
- 做好启动体验：电脑 Web 与手机 Web 都能通过局域网 IP 加端口访问。
- 中英文文档都要能独立说明项目用途、安装、启动、隐私边界和安全边界。

## 发布定位
- `1.0.0` 是适合个人本地和局域网使用的稳定首个公开版本。
- 不把项目描述为可直接裸露到公网的安全服务。
- 域名、反向代理、HTTPS 等内容放在可选高级部署说明中，不作为最小启动路径。

## 必做范围
- 重写 `README.md` 和 `README.zh-CN.md`，围绕首个公开版本组织内容。
- 新增 `PRIVACY.md`，说明本地数据、会话 transcript、审批记录、审计日志、项目本地数据和网络暴露边界。
- 重建 `CHANGELOG.md`，删除旧内部历史，仅保留公开 `1.0.0` 发布说明。
- 新增或更新发布 checklist 和 GitHub Release 文案草稿。
- 更新 issue / PR 模板，提醒用户不要粘贴 `ACCESS_TOKEN`、`.env`、本地 transcript、私有路径、敏感截图或日志。
- 改善 setup/dev/service 启动前端口检查：端口被占用时必须告知用户，并自动推荐可用端口；不得静默使用已占用端口。

## 启动要求
- `HOST=0.0.0.0` 是局域网访问主路径。
- `PORT` 和 `WEB_PORT` 必须可由用户设置。
- setup 需要检测端口占用，发现占用时推荐可用端口并写入用户确认后的 `.env`。
- dev/service 启动也需要避免继续使用已占用端口，并给出清晰错误或推荐。
- README 必须说明电脑访问和手机同 Wi-Fi 访问：
  - 电脑：`http://127.0.0.1:<WEB_PORT>/#/sessions`
  - 手机：`http://<LAN-IP>:<WEB_PORT>/#/sessions`

## 截图与文档资产
- 使用用户提供的两张 UI 截图作为 README 文档资产。
- 桌面横版图放在 README 顶部的界面预览区域，展示主工作台和会话列表。
- 手机竖版图放在“手机访问 / Mobile Access”章节附近，配合局域网 IP 加端口说明。
- 建议目标文件：
  - `docs/images/heaticy-codex-desktop.webp`
  - `docs/images/heaticy-codex-mobile.webp`
- 两张图片应加入 git 管理，因为它们是 README 在 GitHub 上直接渲染所需的稳定文档资产。
- 图片提交前需要压缩，并确认不暴露 token、私密 transcript、敏感路径、私有 IP 或不应公开的域名。

## 命名规则
- 产品展示名：`Heaticy-Codex`
- 包名、目录名、脚本命令中的名称：`heaticy-codex`
- README 和开源文档中按此规则保持一致。

## 不在首版范围
- npm 发布。
- 复杂自动发布流水线。
- 公网裸露部署承诺。
- 大规模功能重构。
