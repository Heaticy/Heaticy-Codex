# Design Spec — Mobile Bottom Anchor and Skill Completion

## 目标
- 手机上打开长会话时，保持现有“正在加载会话…”状态，消息列表 ready 后直接出现在底部。
- 避免移动端出现从顶部慢慢滚到底部的可见过程。
- 在聊天输入框实现 Codex 风格 `$` skill 补全。
- 支持短别名归一化，例如 `$hw:plan` 匹配并插入 `$hypo-workflow:plan`。

## 范围
- 移动端会话打开与历史消息 hydration 后的强制底部定位。
- 桌面端现有瞬间到底部行为保持不变。
- live 会话继续遵守 pinned-to-bottom 逻辑：用户在底部时跟随新消息，用户主动上滚时不强拉回底部。
- 新增认证后的 skill discovery API，后端按 Codex 本地 skill 安装结构发现候选项。
- 前端 composer 根据当前光标 token 做 `$` 前缀补全、过滤、选择、插入。

## Skill 补全策略
- 候选源来自本机 Codex skills，不在前端硬编码固定列表。
- 返回 canonical skill 名，例如 `hypo-workflow:plan`。
- 补全 UI 展示 canonical 名和简短说明。
- 插入文本包含 `$` 前缀，例如 `$hypo-workflow:plan`。
- 移动端支持点击候选项插入。
- 键盘支持 ArrowUp/ArrowDown 选择、Enter/Tab 确认、Escape 关闭。

## 安全与边界
- skill discovery API 需要登录。
- API 只返回补全需要的名称、描述、来源类别和别名，不返回完整 skill 文件内容。
- 后端扫描范围限制在 Codex skill roots 和插件声明的 skills 目录内。
- 不改变 Codex 执行 runner、provider 抽象和 WebSocket 协议。
- 不破坏现有 `npm test` 和 `npm run check`。
