# M2 — App-Server Restart State Fix

## 需求
- 修复审计 `BUG-01`：`src/appServerBridge.js` 的 `shutdown()` 设置 `this.shuttingDown = true` 后不复位，导致 runner restart 后后续异常退出被误认为正常关闭。
- 保持 app-server bridge 现有 stdio/ws 兼容逻辑。

## 实施计划
1. 梳理 `AppServerBridge.shutdown()` 的使用场景：进程永久关闭与 `SessionManager.restartRunner()` 重启。
2. 选择最小改动方案：在 `startProcess()` 或 `ensureReady()` 开始新连接时复位 `this.shuttingDown = false`，或拆出 `restart()` 语义。
3. 确保真正的 server shutdown 仍不会在关闭过程中打多余错误。
4. 为 bridge 添加单元测试：模拟 shutdown 后重新 start，再触发非预期 exit/error 时应 emit error。

## 预期测试
- `npm test` 通过。
- shutdown 后重新连接不会永久保持 `shuttingDown=true`。
- 重启后的非预期 app-server exit 仍会进入错误处理。
- 原有 app-server runner 测试保持通过。

## 预期产出
- 修改 `src/appServerBridge.js`。
- 新增或更新 app-server bridge/runner 相关测试。
- 如需说明，更新架构备注中的 bridge 生命周期描述。
