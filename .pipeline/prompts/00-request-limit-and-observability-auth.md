# M1 — Request Limit And Observability Auth

## 需求
- 修复审计 `SEC-01`：`src/koa-app.js` 的请求体读取在超过限制后不能继续累积内存。
- 行为要求：超限请求返回 `413 Payload Too Large`，并停止正常 JSON 解析/登录流程。
- 修复审计 `SEC-03`：`/api/health` 保持未登录可访问；`/api/healthz` 和 `/api/metrics` 要求登录。
- 保持现有 Koa 路由风格，不引入大型中间件。

## 实施计划
1. 在 `src/koa-app.js` 中为请求体超限定义可识别错误，例如 `statusCode=413`。
2. 修改 `runtime.readBody()`：超过 2 MB 后只处理一次错误，停止继续追加 body，并尽量销毁/恢复请求流，避免继续占用内存。
3. 修改全局错误处理，使 413 返回 `{ error: "Payload Too Large" }` 或等价清晰信息，而不是 500。
4. 在 `src/routes/sessions.js` 中给 `/api/healthz` 和 `/api/metrics` 增加 `runtime.requireAuthorized(ctx)`；不要改 `/api/health`。
5. 增加后端路由测试，覆盖未认证与认证访问，以及超大 `/api/login` body。

## 预期测试
- `npm test` 通过。
- 超大 `/api/login` 请求返回 413。
- 未认证 `GET /api/health` 返回 200。
- 未认证 `GET /api/healthz` 和 `GET /api/metrics` 返回 401。
- 已登录后 `GET /api/healthz` 和 `GET /api/metrics` 返回正常结果。

## 预期产出
- 修改 `src/koa-app.js`。
- 修改 `src/routes/sessions.js`。
- 新增或更新相关 test 文件。
- 不修改审计 SEC-02 审批逻辑。
