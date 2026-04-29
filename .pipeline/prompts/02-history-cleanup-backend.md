# M3 — History Cleanup Backend

## 需求
- 实现历史会话物理清理，处理审计 `PERF-01` 的长期历史膨胀问题。
- 普通历史会话：最后更新时间超过 30 天删除。
- 简单/低信息历史会话：最后更新时间超过 7 天删除。
- 简单会话判定：消息数少于 4 条，或消息文本总长度少于约 1000 字符。
- 删除 transcript 时同步清理自定义名称和归档记录；不删除项目分组索引。
- 清理失败不能影响主服务运行，要记录 warning，并提供报告 API。
- 支持每日定时清理、服务启动后轻量检查、登录后手动触发清理。

## 实施计划
1. 在 `src/config.js` 增加保留策略配置，建议：
   - `HISTORY_RETENTION_DAYS` 默认 30。
   - `HISTORY_SIMPLE_RETENTION_DAYS` 默认 7。
   - `HISTORY_SIMPLE_MAX_MESSAGES` 默认 4。
   - `HISTORY_SIMPLE_MAX_CHARS` 默认 1000。
   - `HISTORY_CLEANUP_INTERVAL_HOURS` 默认 24。
2. 在 `SessionManager` 历史扫描逻辑附近新增清理方法，复用 `scanHistoricalSessionsForProvider()` 的解析结果，避免新增重复 parser。
3. 删除过期 transcript 文件时调用现有 `clearArchived()` / `removeCustomName()` 清理元数据，并保存。
4. 增加维护报告状态：最近一次 summary、最近 50 条 warning，包含时间、删除数量、失败数量、最近错误。
5. 在 `SessionManager` 初始化后安排启动轻量检查和每日定时器；shutdown 时清理 timer。
6. 新增 authenticated API：
   - `GET /api/maintenance/report`
   - `POST /api/maintenance/cleanup`
7. 增加测试：过期普通会话删除、过期简单会话删除、活跃会话保留、失败进入报告且不抛出到主流程。

## 预期测试
- `npm test` 通过。
- 30 天外普通历史会话被删除。
- 7 天外简单历史会话被删除。
- 未过期或活跃历史会话保留。
- 删除 transcript 后对应 custom name/archive metadata 被清理。
- 删除失败只进入 warning/report，不导致服务崩溃。
- 未登录访问维护 API 返回 401，登录后可访问。

## 预期产出
- 修改 `src/config.js`。
- 修改 `src/sessionManager.js`。
- 新增或修改维护路由文件，例如 `src/routes/maintenance.js`，并接入 `src/koa-app.js`。
- 新增/更新测试文件。
