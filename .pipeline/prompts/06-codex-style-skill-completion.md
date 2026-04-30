# M7 — Codex-style skill completion

## 需求

- 在 Heaticy-Codex 的聊天输入框中实现和 Codex 类似的 `$skill` 补全体验。
- 补全来源按 Codex home 解析：优先使用 `CODEX_HOME`，默认 `~/.codex`，扫描 `skills/**/SKILL.md`。
- skill 范围包含 `.system`、普通 skill、以及 `hypo-workflow` 这类子 skill。
- 当前光标所在 token 以 `$` 开头时触发补全；句子中间输入 `请用 $hypo` 也应出现候选。
- 用户输入 `$h`、`$hypo`、`$hw:plan` 等前缀时过滤候选。
- 选择候选后插入 canonical 文本，例如 `$hypo-workflow:plan`，不自动发送。
- 支持通用 alias；例如 `hypo-workflow:plan` 可由 `hw:plan` 匹配，并在唯一命中时发送前归一化为 `$hypo-workflow:plan`。
- alias 冲突时不自动归一化，只展示候选供用户选择。
- UI 移动端优先：补全列表显示在输入框上方，最多 5 条，可滚动，手指点击插入。
- 桌面端同时支持点击、上下键、Enter/Tab 选择、Esc 关闭。
- 候选展示主行 `$skill-name`，副行 `description`，副行一行截断。
- 后端做 skill catalog 缓存：`5s TTL + ?refresh=1` 手动刷新。

## 实施计划

1. M7.1 Skill catalog backend
   - 新增 `src/skillsCatalog.js` 或等价模块，封装扫描、解析、alias 生成、缓存和查询逻辑。
   - 解析 `SKILL.md` 顶部 frontmatter 的 `name` 和 `description`；保留真实 `path`。
   - 生成 canonical name：
     - 普通 skill 使用 frontmatter `name` 或目录名。
     - 子 skill 使用父目录命名空间和子 skill 名，例如 `hypo-workflow:plan`。
   - 生成通用 alias：
     - 多词命名空间按短横线分段取首字母，例如 `hypo-workflow` -> `hw`。
     - 子 skill alias 保留冒号后的子名，例如 `hypo-workflow:plan` -> `hw:plan`。
     - alias 只用于匹配和唯一命中归一化；冲突时不自动替换。
   - 新增 `/api/skills` 路由，需登录访问，返回 canonical name、description、path、aliases。
   - `/api/skills?refresh=1` 强制刷新缓存。
   - 坏 frontmatter、缺失 description、不可读文件不应导致接口整体失败。

2. M7.2 Composer completion UI
   - 修改 `web/src/components/ChatView.vue`，进入会话时拉取 skill catalog。
   - 抽出可测试的 token 检测、过滤、替换范围和候选排序 helper。
   - 只有当前光标 token 以 `$` 开头时显示补全。
   - 前缀过滤匹配 canonical name、alias 和 description。
   - 移动端在 composer 上方显示最多 5 条候选，可滚动，点击后替换当前 token。
   - 桌面端支持点击、上下键移动、Enter/Tab 选择、Esc 关闭；输入法组合期间不拦截键盘。
   - 选择候选后只替换当前 `$` token，保留 token 前后的原始文本和光标位置。

3. M7.3 Alias normalization and validation
   - 在发送前对当前 draft 中的 skill alias 做归一化。
   - 只替换唯一命中的 alias，例如 `$hw:plan` -> `$hypo-workflow:plan`。
   - alias 冲突、普通 `$` 文本、shell 变量、金额、非 skill token 不应被误替换。
   - 前端和后端 alias 规则保持一致；如无法共享模块，必须用测试锁住一致性。
   - 评估旧版 `public/app.js` fallback 是否仍需同步支持；若不支持，在文档或架构说明中记录原因。
   - 更新轻量文档或 README 相关段落，说明 `$skill` 补全来源、移动端点击选择和 alias 行为。

## 预期测试

- 后端单元测试：
  - 扫描 `CODEX_HOME/skills/**/SKILL.md`。
  - 解析 frontmatter 的 `name`、`description`。
  - 子 skill canonical name 为 `namespace:name`。
  - alias 生成覆盖 `hypo-workflow:plan -> hw:plan`。
  - alias 冲突可被检测，且不会自动归一化。
  - 缓存 5 秒内复用，`?refresh=1` 强制刷新。
  - 坏文件或不可读文件不会让 `/api/skills` 整体失败。
- 前端 helper 测试：
  - `$h` 触发补全。
  - `请用 $hypo` 在句中触发补全。
  - 普通文本、`$` 后没有可匹配 token、非当前 token 不触发或不误替换。
  - 点击/选择候选只替换当前 token。
  - `$hw:plan` 唯一命中时可归一化为 `$hypo-workflow:plan`。
  - alias 冲突时不归一化。
- 构建与回归：
  - `npm test` 通过。
  - `npm run check` 通过。
  - `npm run web:build` 通过。
  - `git diff --check` 通过。

## 手动验收

- 打开移动端会话，输入 `$h`，输入框上方出现最多 5 条候选。
- 输入 `请用 $hypo`，候选仍出现。
- 点击 `$hypo-workflow:plan` 后，当前 token 被替换，文本不自动发送。
- 桌面端输入 `$h` 后，可用上下键选择、Enter/Tab 插入、Esc 关闭。
- 手输 `$hw:plan` 并发送时，发送给 Codex 的文本为 `$hypo-workflow:plan`。
- 构造 alias 冲突时，发送前不自动替换。

## 预期产出

- `src/skillsCatalog.js` 或等价模块。
- `/api/skills` 路由实现，可放入现有 route 或新增 `src/routes/skills.js`。
- `web/src/components/ChatView.vue` 补全 UI。
- 可测试的前端 completion helper，例如 `web/src/lib/skill-completion.js`。
- 新增或更新 `test/*.test.js`。
- 新增或更新前端 helper 测试。
- 必要的 README/架构说明更新。
- `.pipeline/architecture.md`
- `.pipeline/confirm-summary.md`
