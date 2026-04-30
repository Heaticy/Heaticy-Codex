# heaticy-codex — 开发进度

> 最后更新：2026-04-30 15:25 | 状态：已完成 | 进度：6/6 Milestone

## 当前状态
✅ **全部里程碑完成** — `Heaticy-Codex 1.0.0` 首个公开开源版本准备完成

## Milestone 进度

| # | Milestone | 状态 | 摘要 |
|---|-----------|------|------|
| M1 | Request limit and observability auth | ✅ 完成 | 413 请求体限制、healthz/metrics 鉴权、22 个测试通过 |
| M2 | App-server restart state fix | ✅ 完成 | bridge shutdown 重启状态复位，23 个测试通过 |
| M3 | History cleanup backend | ✅ 完成 | 历史清理策略、维护报告与 API，27 个测试通过 |
| M4 | Maintenance report UI | ✅ 完成 | 会话列表维护条、手动清理入口、web:build 通过 |
| M5 | Final regression and documentation | ✅ 完成 | npm test / npm run check / git diff --check 通过，文档已更新 |
| M6 | First public open-source release 1.0.0 | ✅ 完成 | 隐私、端口/LAN、双语 README、截图、发布物与最终验收完成 |

## 最近活动
- **01:06** M1 开始执行，进入 write_tests。
- **01:07** M1 write_tests 完成，新增 3 个后端安全路由测试。
- **01:07** M1 review_tests 完成，覆盖项与 prompt 要求一致。
- **01:08** M1 run_tests_red 完成，新增测试 2 fail / 1 pass，失败原因匹配预期。
- **01:12** M1 run_tests_green 完成，`npm test` 22/22 通过，`npm run check` 通过。
- **01:12** M1 review_code 完成，进入 M2 write_tests。
- **01:14** M2 write_tests/review_tests 完成，新增 bridge 生命周期测试。
- **01:14** M2 run_tests_red 完成，新增测试 1 fail / 2 pass，失败原因匹配预期。
- **01:18** M2 run_tests_green/review_code 完成，`npm test` 23/23 通过，`npm run check` 通过。
- **01:18** M3 开始执行，进入 write_tests。
- **01:33** M3 run_tests_green/review_code 完成，`npm test` 27/27 通过，`npm run check` 通过。
- **01:33** M4 开始执行，进入 write_tests。
- **01:42** M4 完成，维护报告 UI 已接入会话列表，`npm run web:build` 通过。
- **01:42** M5 完成，最终回归、README 与 architecture 更新完成。
- **15:11** M6 开始执行，进入 write_tests；将先补端口检测测试，再推进实现与文档。
- **15:14** M6 端口检测测试红灯符合预期：缺少 `scripts/lib/ports.mjs`。
- **15:16** M6 实现端口检测、setup/dev/service 集成、双语 README、PRIVACY、CHANGELOG、release checklist、release notes 与截图资产。
- **15:25** M6 最终验证通过：`npm test`、`npm run check`、`git diff --check`。

## Deferred 项
- 无
