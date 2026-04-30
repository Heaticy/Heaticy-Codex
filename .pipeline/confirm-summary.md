# Plan Confirm — Heaticy-Codex 1.0.0 Open Source Release

## 项目
- name: `heaticy-codex`
- stack: Node/Koa/Vue browser-based Codex workspace
- preset: `tdd`
- mode: revise pending

## 里程碑
- existing completed: M1-M5
- pending: M6
- total prompts: 6
- completed prompts: 5

## 当前待执行 prompt
- `.pipeline/prompts/05-first-public-open-source-release.md`

## M6 子任务
- M6.1：开源身份、fork 致谢、隐私基线、issue/PR 隐私提醒
- M6.2：端口占用检测、可用端口推荐、LAN `0.0.0.0` 访问
- M6.3：中英文 README、桌面/手机截图资产和位置
- M6.4：公开 `1.0.0` CHANGELOG、release checklist、GitHub Release 文案
- M6.5：最终测试、secret/privacy scan、公开发布验收

## 更新文件
- `.pipeline/config.yaml`
- `.pipeline/state.yaml`
- `.pipeline/design-spec.md`
- `.pipeline/architecture.md`
- `.pipeline/confirm-summary.md`
- `.plan-state/discover.yaml`
- `.plan-state/decompose.yaml`
- `.plan-state/generate.yaml`

## 规划决策
- 已完成 M1-M5 保留不动。
- 未执行的旧 M6-M9 被替换为一个 compact M6。
- 正式 milestone id 保持整数 `M6`，小数点编号只作为 prompt 内部子任务。
- 首个公开版本定位为 `1.0.0`，适合个人本地和局域网使用。
- README 截图建议纳入 git，目标路径为 `docs/images/heaticy-codex-desktop.webp` 和 `docs/images/heaticy-codex-mobile.webp`。

## 执行门槛
已通过用户确认并执行完成。

## 完成结果
- `npm test`：31 passed
- `npm run check`：passed
- `git diff --check`：passed
- `Heaticy-Codex 1.0.0` 首个公开开源版本准备完成。
