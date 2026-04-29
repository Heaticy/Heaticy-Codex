# Debug-001: 手机端打开长会话仍从顶部滑到底部

> Language: zh-CN | Timezone: Asia/Shanghai

## Symptom

用户反馈：手机上打开会话时，消息列表仍然能看到从上往下滑到底部的过程，而不是直接出现在底部。

## Context

- Recent changes: `729a866 Add audit fixes and workflow plan` 只提交了前置审计修复和 M6-M9 计划，M6 的移动端底部锚定实现尚未执行。
- Related modules:
  - `web/src/components/ChatView.vue`：聊天消息流、`openToken` watcher、`scrollToBottom()`、移动端 visual viewport 处理。
  - `web/src/App.vue`：历史会话 hydration 完成后通过 props/messages/openToken 驱动 ChatView 渲染。

## Hypotheses And Validation

1. M6 计划尚未执行，当前线上代码仍是旧滚动实现 — confirmed
   Validation: 最近提交包含 `.pipeline/prompts/05-mobile-instant-bottom-anchor.md`，但 `ChatView.vue` 仍使用旧 `scrollToBottom(true)` 路径。

2. `scrollToBottom(true)` 在 `nextTick` 后执行，移动端会先绘制顶部内容，再由脚本滚到底部 — confirmed
   Validation: `openToken` watcher 使用 `flush: post` 调用 `scrollToBottom(true)`；旧函数在 DOM 更新后再设置 `scrollTop`。

3. `-webkit-overflow-scrolling: touch` 和连续 `requestAnimationFrame` 补滚会让强制滚动在手机上呈现为可见的逐帧移动 — confirmed
   Validation: `.message-stream` 启用 momentum scroll；旧实现连续 RAF 设置 `scrollTop = scrollHeight`。

4. 历史消息中的图片懒加载是主要原因 — not primary
   Validation: 症状发生在打开长会话的整体滚动阶段；当前代码对纯文本长列表也会先渲染再补滚。

## Root Cause

根因是打开会话时的“强制到底部”仍走普通滚动路径：DOM 已经渲染出长消息列表后，`nextTick`/RAF 再设置 `scrollTop`。在移动端，带 momentum scroll 的容器会把这几次补滚暴露成用户可见的从顶部到尾部滑动。

## Fix Applied

- 在 `ChatView.vue` 增加 `anchorSessionToBottom()`，专门处理会话打开/挂载时的底部锚定。
- 移动端锚定期间临时隐藏消息流，避免顶部内容先被用户看到。
- 锚定期间临时禁用 `-webkit-overflow-scrolling: touch`，使用 `scroll-behavior: auto`。
- 等 `scrollHeight` 连续稳定后再显示消息流。
- programmatic scroll 期间忽略 scroll event，避免误判用户已经离开底部。

## Validation

- `npm run web:build` passed.

## Architecture Impact

架构不变。该修复收敛在 `ChatView.vue` 的消息流锚定策略，属于 M6 范围内的前端交互修复。
