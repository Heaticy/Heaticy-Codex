# Debug-002: 电脑端打开会话时首个输入气泡被顶部栏遮挡

> Language: zh-CN | Timezone: Asia/Shanghai

## Symptom

用户反馈：电脑端打开聊天会话时，自己的第一个输入气泡会被最顶上的栏挡住。

## Context

- 前端聊天页由 `web/src/components/ChatView.vue` 渲染。
- 顶部会话栏在 `ChatView.vue`，运行状态栏在 `web/src/components/SessionStatusBar.vue`。
- 桌面三栏 workbench 由 `web/src/styles/main.css` 控制，聊天页作为右侧主区域的全高 flex 子树显示。
- 近期已有 `DEBUG-001` 修复移动端打开长会话时可见滚动到底部的问题，但该修复没有处理桌面端顶部栏占位。

## Hypotheses And Validation

1. `ChatView` scoped CSS 使用 sticky 顶栏和 fixed `min-height`，桌面全高 flex 区域里消息流可能被顶栏覆盖 — confirmed
   Validation: `.mobile-header` 是 `position: sticky; top: 0`，`.chat-screen` 是 `min-height: calc(100dvh - 72px)`，这些 scoped 规则特异性高于全局桌面规则。

2. `SessionStatusBar` 的 `top: 50px` 和实际头部高度不完全一致，可能在桌面端产生几像素到一整行的遮挡 — confirmed
   Validation: `SessionStatusBar.vue` 使用 `position: sticky; top: 50px`，而聊天页顶部栏高度由按钮、padding、safe area 和全局 `.mobile-header.compact` 共同决定。

3. 底部锚定逻辑把消息滚动到错误位置 — not primary
   Validation: `anchorSessionToBottom()` 只写入消息流的 `scrollTop`，没有直接改变顶部栏位置；遮挡风险来自布局区域没有清晰分隔。

4. 消息气泡本身的宽度或 markdown 渲染导致遮挡 — not primary
   Validation: 用户气泡样式只影响横向宽度和内部文本换行，不会改变其相对顶部栏的垂直层叠。

## Root Cause

聊天页的顶部栏和状态栏本来应该作为 flex 布局中的流内固定区域，消息列表只在剩余高度里滚动。但当前组件级 CSS 使用 sticky 定位和固定视口高度估算，让桌面三栏布局中顶部栏、状态栏、消息滚动区之间存在重叠风险；状态栏还硬编码了 `top: 50px`，和实际头部高度不一定一致。

## Fix Applied

- `ChatView.vue`
  - 将 `.chat-shell` 明确设为纵向 flex 容器并隐藏外层溢出。
  - 将聊天顶部栏改为流内 `position: relative`，并设为 `flex: 0 0 auto`。
  - 将 `.chat-screen` 改为 `flex: 1 1 auto; min-height: 0; overflow: hidden`。
  - 给 `.message-stream` 补上 `min-height: 0` 和 `scroll-padding-top`，确保消息滚动只发生在独立滚动区。
- `SessionStatusBar.vue`
  - 将状态栏改为流内 `position: relative`，移除硬编码 `top: 50px`。

## Validation

- `npm run web:build` passed.
- `npm run check` passed.

## Architecture Impact

架构不变。修复仅收敛在聊天页布局 CSS，把顶部栏、状态栏和消息流的职责从 sticky 叠层改为明确的 flex 分区。
