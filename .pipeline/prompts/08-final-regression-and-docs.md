# M9 — Final regression and documentation

## 需求

- 对移动端底部定位和 `$` skill 补全做最终回归。
- 更新文档和架构说明，记录新 API、前端补全行为、移动端会话打开预期。
- 保持已有审计修复、维护报告、历史清理等功能不回退。

## 实施计划

1. 运行后端测试，确认新增 skill discovery 测试与既有测试都通过。
2. 运行前端构建和项目 check。
3. 检查移动端和桌面端关键 UI 行为，必要时补充手工验证说明。
4. 更新 README/README.zh-CN 或相关 docs，说明 `$` skill completion 的触发、别名和插入格式。
5. 更新 `.pipeline/architecture.md` 的最终状态。
6. 执行 `git diff --check`。

## 预期测试

- `npm test` 通过。
- `npm run check` 通过。
- `git diff --check` 通过。
- 文档包含 `$hypo-workflow:plan` 和 `$hw:plan` 归一化行为说明。
- 架构说明包含 skill discovery API 与 mobile bottom-anchor 行为。

## 预期产出

- 更新 README/README.zh-CN 或相关 docs。
- 更新 `.pipeline/architecture.md`。
- 最终回归结果记录在响应或 pipeline report 中。
