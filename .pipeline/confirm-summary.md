# Plan Confirm — Codex-style Skill Completion

## 项目
- name: `heaticy-codex`
- stack: Node/Koa/Vue browser-based Codex workspace
- preset: `tdd`
- mode: append milestone

## 里程碑
- existing completed: M1-M6
- pending confirmation: M7
- total prompts after confirm: 7

## 当前待确认 prompt
- `.pipeline/prompts/06-codex-style-skill-completion.md`

## M7 子任务
- M7.1：Skill catalog backend
  - `CODEX_HOME || ~/.codex`
  - 扫描 `skills/**/SKILL.md`
  - 解析 `name/description/path`
  - 生成 canonical name 和通用 alias
  - `/api/skills`
  - `5s TTL + ?refresh=1`
- M7.2：Composer completion UI
  - 当前 token 以 `$` 开头时触发
  - 支持句中 `$hypo`
  - 移动端输入框上方最多 5 条，点击插入
  - 桌面端点击、上下键、Enter/Tab、Esc
  - 显示 `$skill-name` 和一行 description
- M7.3：Alias normalization and validation
  - 发送前唯一 alias 命中归一化
  - alias 冲突不自动替换
  - 不误改普通 `$` 文本
  - 补齐测试、构建和轻量文档

## 更新文件
- `.pipeline/config.yaml`
- `.pipeline/state.yaml`
- `.pipeline/PROGRESS.md`
- `.pipeline/architecture.md`
- `.pipeline/confirm-summary.md`
- `.pipeline/prompts/06-codex-style-skill-completion.md`
- `.plan-state/discover.yaml`
- `.plan-state/decompose.yaml`
- `.plan-state/generate.yaml`

## 规划决策
- 后端来源按 Codex home：优先 `CODEX_HOME`，默认 `~/.codex`。
- skill 范围为本机已安装 skills：`.system`、普通 skill、子 skill。
- alias 做通用规则，示例：`hypo-workflow:plan -> hw:plan`。
- 选择候选后插入 canonical 文本，例如 `$hypo-workflow:plan`。
- 移动端是主路径，候选列表最多 5 条。
- alias 冲突时不自动归一化。
- 后端缓存使用 `5s TTL + ?refresh=1`。
- 正式 milestone id 使用 `M7`，小数点编号只作为 prompt 内部子任务。

## 执行门槛
已通过用户确认并执行完成。

## 完成结果
- 新增认证后的 `/api/skills`，按 `CODEX_HOME || ~/.codex` 扫描 `skills/**/SKILL.md`，支持 `5s TTL + ?refresh=1`。
- 新增移动端优先 `$skill` 补全，候选在 composer 上方最多显示 5 条，点击插入 canonical 名称。
- 桌面端支持点击、上下键、Enter/Tab 和 Esc。
- 发送前唯一 alias 命中归一化，例如 `$hw:plan` -> `$hypo-workflow:plan`；冲突 alias 不自动替换。
- `npm test`：39 passed。
- `npm run check`：passed。
- `git diff --check`：passed。
