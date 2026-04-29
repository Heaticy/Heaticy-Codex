# M4 — Maintenance Report UI

## 需求
- 在前端会话列表页提供“有东西一点”的维护报告入口。
- 展示最近清理时间、删除数量、失败数量、最近 warning。
- 支持手动触发清理，触发后刷新报告。
- UI 位置：会话列表页状态/工具区域，保持现有产品风格，不做营销式大卡片。

## 实施计划
1. 在 `web/src/lib/api.js` 增加维护报告和手动清理 API helper。
2. 在 `web/src/App.vue` 增加维护报告状态、加载状态、错误状态，并在登录后/会话列表刷新时拉取报告。
3. 在 `web/src/components/SessionListView.vue` 增加一个紧凑维护状态区：
   - 最近清理时间。
   - 删除数量。
   - 失败数量。
   - 最近 warning 摘要。
   - 手动清理按钮。
4. 手动清理按钮要有 loading/disabled 状态，失败时给出明确错误，不影响其他会话操作。
5. 保持移动端布局不拥挤，文本不要溢出。

## 预期测试
- `npm run web:build` 通过。
- 维护报告能在会话列表页展示。
- 手动清理按钮调用后端并刷新报告。
- 报告为空或从未运行时显示自然的空状态。

## 预期产出
- 修改 `web/src/lib/api.js`。
- 修改 `web/src/App.vue`。
- 修改 `web/src/components/SessionListView.vue`。
- 如有必要，修改 `web/src/styles/main.css`。
