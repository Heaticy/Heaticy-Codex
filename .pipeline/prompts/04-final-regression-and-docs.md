# M5 — Final Regression And Docs

## 需求
- 对 M1-M4 做最终回归。
- 更新运维文档，让用户知道观测接口权限变化和历史清理配置。
- 审查架构差异，确保 `.pipeline/architecture.md` 能反映最终实现。

## 实施计划
1. 运行 `npm test`。
2. 运行 `npm run check`。
3. 运行 `git diff --check`。
4. 更新 `README.md` 和/或 `README.zh-CN.md`：
   - `/api/health` public，`/api/healthz`/`/api/metrics` authenticated。
   - 历史清理默认 30 天/7 天。
   - 维护报告和手动清理入口。
   - 可配置环境变量。
5. 更新 `.pipeline/architecture.md` 的架构差异记录。

## 预期测试
- `npm test` 通过。
- `npm run check` 通过。
- `git diff --check` 通过。
- 文档包含新增配置和行为变化。

## 预期产出
- 更新 README/运维说明。
- 更新 `.pipeline/architecture.md`。
- 最终验证结果记录在交付回复中。
