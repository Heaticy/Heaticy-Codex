# M6 — Mobile instant bottom anchoring

## 需求

- 修复手机端打开长会话时可见的“从顶部慢慢滚到底部”过程。
- 保持现有“正在加载会话…”状态；历史消息 ready 后，聊天列表应直接显示在底部。
- 保持桌面端当前瞬间到底部体验，不引入桌面回归。
- 保持 live 会话 pinned-to-bottom 语义：用户在底部时新消息继续跟随，用户主动上滚时不强制拉回底部。

## 实施计划

1. 检查 `web/src/components/ChatView.vue` 当前 `scrollToBottom()`、`openToken` watcher、message watcher、`visualViewport` handler 与 `-webkit-overflow-scrolling` 的交互。
2. 区分“打开会话/历史 hydration 后强制定位”和“流式消息追加时跟随底部”两类滚动意图。
3. 对强制定位路径使用无动画、同步感更强的底部设置，必要时在移动端临时禁用 momentum scroll 或延迟显示长列表直到定位完成。
4. 保持 composer resize、键盘弹出和 visual viewport 变化时的底部修正。
5. 避免为了移动端修复而改变桌面端滚动行为。

## 预期测试

- 构造或使用长历史会话，在移动端视口打开时，列表不应先露出顶部再滚到底部。
- 桌面端打开同一会话仍直接到底部。
- 当用户在 live 会话中停留底部，新 assistant 输出继续自动跟随。
- 当用户主动向上滚动阅读历史，新消息或 composer resize 不应强制抢回底部，除非重新打开会话。
- `npm run web:build` 通过。

## 预期产出

- 更新 `web/src/components/ChatView.vue`。
- 如需状态配合，可小范围更新 `web/src/App.vue`。
- 如现有样式导致移动端 momentum 滚动问题，可更新 `web/src/styles/main.css` 或组件 scoped style。
- 在架构或文档中记录移动端会话打开的 bottom-anchor 行为。
