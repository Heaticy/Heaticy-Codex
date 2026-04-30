# Debug 003 — Skill completion not visible at runtime

## Symptom

用户反馈：电脑端和移动端输入 `$hypo-workflow:debug` 相关前缀时都没有 `$skill` 补全。

## Context

- M7 已新增 `src/skillsCatalog.js`、认证后的 `/api/skills`、前端 composer 补全和 alias 归一化。
- 本地代码扫描 `~/.codex/skills/**/SKILL.md` 能发现 `hypo-workflow:debug`。
- 当前运行服务进程在 2026-04-30 04:00 左右启动，早于 M7 代码变更。

## Hypotheses

1. 当前线上 PM2/Node 服务仍是旧进程，未加载 `/api/skills` 路由。
2. skill catalog 扫描不到 `hypo-workflow:debug`。
3. 前端 token 触发逻辑不匹配 `$hypo` 或 `$`。
4. 前端静态资产未更新。

## Validation

- 直接调用本地 `discoverSkills()`：能返回 `hypo-workflow:debug` 和 alias `hw:debug`。
- 直接调用 helper：`filterSkillCompletions(skills, "hypo")` 能返回 Hypo-Workflow 候选。
- 对运行中服务请求 `/api/skills?refresh=1`：初始返回 `Not found`，确认旧服务未加载 M7 路由。
- 重启服务后再次请求 `/api/skills?refresh=1`：返回 36 个 skills，包含 `hypo-workflow:debug`。
- 修正 helper 后验证单独 `$`：`findSkillToken("$", 1)` 返回有效 token，空 query 显示前 5 个候选。

## Root Cause

主要根因是运行中的 Heaticy-Codex 服务没有在 M7 后重启，仍使用旧后端进程和旧前端资产，所以浏览器无法加载 `/api/skills`，补全列表为空。

次要体验问题是前端 helper 原本要求 `$` 后至少一个字符，因此只输入单独 `$` 时不会弹出候选；这不影响 `$h` 前缀触发，但不够接近 Codex 的即时补全体验。

## Fix

- 执行 `npm run service:restart`，刷新 PM2 服务和前端构建产物。
- 更新 `web/src/lib/skill-completion.js`，允许单独 `$` 触发候选。
- 更新 `test/skillCompletion.test.js`，覆盖单独 `$` 和空 query 候选。

## Validation Result

- `node --test test/skillCompletion.test.js test/skillsCatalog.test.js`：通过。
- `npm run web:build`：通过。
- `npm run service:restart`：通过。
- `/api/skills?refresh=1`：返回 `hypo-workflow:debug`，alias 为 `hw:debug`。
