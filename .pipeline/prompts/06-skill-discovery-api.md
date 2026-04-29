# M7 — Codex skill discovery API

## 需求

- 新增认证后的后端 API，为前端 `$` skill 补全提供 Codex 风格候选项。
- 候选项来自本机 Codex skill 安装结构，不在前端硬编码。
- 支持系统 skill、普通 skill、插件声明的 skills 目录，以及 `hypo-workflow/skills/*/SKILL.md` 这类嵌套 skill。
- 支持短别名匹配需求，例如 `$hw:plan` 可匹配 canonical `hypo-workflow:plan`。
- API 不返回完整 skill 文件内容，只返回补全所需元数据。

## 实施计划

1. 在后端增加 skill discovery 逻辑，优先基于 `config.codexHome` 或 `CODEX_HOME` 推导 skill root。
2. 扫描允许范围内的 `SKILL.md`，解析 front matter 中的 `name`、`description`。
3. 生成 canonical skill 名：
   - 顶层 skill 使用目录名或 front matter name。
   - 插件子 skill 使用 `plugin-name:skill-name`，例如 `hypo-workflow:plan`。
4. 读取 `.codex-plugin/plugin.json` 中的 `skills` 声明，用于确认插件技能目录。
5. 增加别名字段，至少覆盖 Hypo-Workflow 的 Codex 常用短别名 `hw` -> `hypo-workflow`。
6. 新增认证路由，例如 `/api/skills` 或 `/api/skill-completions`，返回稳定排序的候选列表。
7. 增加测试覆盖 discovery、front matter 解析、alias 匹配数据、认证限制。

## 预期测试

- 本机安装 `~/.codex/skills/hypo-workflow/skills/plan/SKILL.md` 时，API 返回 `hypo-workflow:plan`。
- `hypo-workflow:plan` 候选包含可让前端用 `$hw:plan` 匹配到它的 alias 元数据。
- `.system` skills 和普通顶层 skills 可被发现。
- 未登录访问 API 返回 401。
- discovery 不泄漏完整 `SKILL.md` 正文。
- `npm test` 通过。

## 预期产出

- 新增或更新后端 skill discovery 模块。
- 新增或更新 Koa route。
- 新增后端测试。
- 必要时更新 `src/config.js` 暴露 Codex skill root 所需配置。
