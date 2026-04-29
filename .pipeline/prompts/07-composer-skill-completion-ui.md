# M8 — Composer skill completion UI

## 需求

- 在聊天输入框实现 Codex 风格 `$` skill 补全。
- 输入当前光标所在 token 以 `$` 开头并有前缀时显示候选项。
- 支持 `$hypo` 匹配 `$hypo-workflow:plan` 等 canonical skill。
- 支持 `$hw:plan` 匹配并插入 `$hypo-workflow:plan`。
- 移动端点击候选项插入；桌面和外接键盘支持 ArrowUp/ArrowDown、Enter/Tab、Escape。

## 实施计划

1. 在 `web/src/lib/api.js` 增加 skill completion API helper。
2. 在 `web/src/App.vue` 登录后加载并缓存 skill candidates，传入 `ChatView`。
3. 在 `ChatView` 中根据 textarea selectionStart/selectionEnd 找到当前 token 的 `$` 前缀范围。
4. 实现过滤排序：
   - canonical name 前缀优先。
   - alias 前缀匹配，例如 `hw:plan`。
   - description 只用于展示，不作为高优先级匹配。
5. 选择候选时替换当前 token 为 canonical `$skill-name`，保留前后文本并恢复 cursor。
6. 键盘处理需要与现有 Enter 发送逻辑协调：补全打开时 Enter/Tab 用于确认，补全关闭时保留原发送行为。
7. 设计 popup 样式，确保移动端位于 composer 上方，不遮挡发送按钮，不越界。

## 预期测试

- 输入 `$hypo` 时出现 `hypo-workflow:*` 候选。
- 输入 `$hw:plan` 时可插入 `$hypo-workflow:plan`。
- 点击候选项可插入并聚焦回输入框。
- ArrowUp/ArrowDown 可移动选择，Enter/Tab 插入，Escape 关闭。
- 补全关闭时，桌面端 Enter 仍发送消息。
- 手机端布局不遮挡输入框与发送按钮。
- `npm run web:build` 通过。

## 预期产出

- 更新 `web/src/App.vue`。
- 更新 `web/src/components/ChatView.vue`。
- 更新 `web/src/lib/api.js`。
- 如需要，更新 `web/src/styles/main.css` 或组件 scoped style。
