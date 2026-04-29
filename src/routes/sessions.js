export async function handleSessionRoute(ctx, runtime) {
  if (ctx.path === "/api/sessions" && ctx.method === "GET") {
    if (!runtime.requireAuthorized(ctx)) {
      return true;
    }

    runtime.json(ctx, 200, { sessions: runtime.sessionManager.listAll() });
    return true;
  }

  if (ctx.path === "/api/projects" && ctx.method === "GET") {
    if (!runtime.requireAuthorized(ctx)) {
      return true;
    }

    runtime.json(ctx, 200, { projects: runtime.sessionManager.listProjects() });
    return true;
  }

  if (ctx.path === "/api/codex-threads" && ctx.method === "GET") {
    if (!runtime.requireAuthorized(ctx)) {
      return true;
    }

    const url = new URL(ctx.url, "http://localhost");
    runtime.json(ctx, 200, {
      threads: runtime.sessionManager.listCodexThreads({
        limit: Number(url.searchParams.get("limit") || 50)
      })
    });
    return true;
  }

  if (ctx.path.startsWith("/api/sessions/") && ctx.path.endsWith("/raw-events") && ctx.method === "GET") {
    if (!runtime.requireAuthorized(ctx)) {
      return true;
    }
    const parts = ctx.path.split("/");
    const id = decodeURIComponent(parts[3] || "");
    const url = new URL(ctx.url, "http://localhost");
    try {
      runtime.json(ctx, 200, {
        events: runtime.sessionManager.getRawEvents(id, {
          limit: Number(url.searchParams.get("limit") || 50)
        })
      });
    } catch (err) {
      runtime.json(ctx, 404, { error: err?.message || String(err) });
    }
    return true;
  }

  if (ctx.path.startsWith("/api/sessions/") && ctx.path.endsWith("/ping") && ctx.method === "POST") {
    if (runtime.forbidCrossOrigin(ctx)) {
      return true;
    }
    if (!runtime.requireAuthorized(ctx)) {
      return true;
    }
    const parts = ctx.path.split("/");
    const id = decodeURIComponent(parts[3] || "");
    try {
      runtime.json(ctx, 200, { meta: await runtime.sessionManager.pingRunner(id) });
    } catch (err) {
      runtime.json(ctx, 400, { error: err?.message || String(err) });
    }
    return true;
  }

  if (ctx.path.startsWith("/api/sessions/") && ctx.path.endsWith("/restart") && ctx.method === "POST") {
    if (runtime.forbidCrossOrigin(ctx)) {
      return true;
    }
    if (!runtime.requireAuthorized(ctx)) {
      return true;
    }
    const parts = ctx.path.split("/");
    const id = decodeURIComponent(parts[3] || "");
    try {
      runtime.json(ctx, 200, { session: await runtime.sessionManager.restartRunner(id) });
    } catch (err) {
      runtime.json(ctx, 400, { error: err?.message || String(err) });
    }
    return true;
  }

  if (ctx.path.startsWith("/api/sessions/") && ctx.method === "GET" && !ctx.path.endsWith("/resize")) {
    if (runtime.forbidCrossOrigin(ctx)) {
      return true;
    }
    if (!runtime.requireAuthorized(ctx)) {
      return true;
    }

    const parts = ctx.path.split("/");
    const id = decodeURIComponent(parts[3] || "");
    const session = runtime.sessionManager.get(id);
    if (!session) {
      runtime.json(ctx, 404, { error: "Session not found" });
      return true;
    }
    runtime.json(ctx, 200, { session: runtime.sessionManager.serialize(session) });
    return true;
  }

  if (ctx.path === "/api/archived-sessions" && ctx.method === "GET") {
    if (!runtime.requireAuthorized(ctx)) {
      return true;
    }

    runtime.json(ctx, 200, { sessions: runtime.sessionManager.listArchived() });
    return true;
  }

  if (ctx.path === "/api/fs" && ctx.method === "GET") {
    if (!runtime.requireAuthorized(ctx)) {
      return true;
    }

    try {
      const url = new URL(ctx.url, "http://localhost");
      runtime.json(ctx, 200, runtime.listDirectoryPayload(url.searchParams.get("path")));
    } catch (err) {
      runtime.json(ctx, 400, { error: err?.message || String(err) });
    }
    return true;
  }

  if (ctx.path === "/api/sessions" && ctx.method === "POST") {
    if (runtime.forbidCrossOrigin(ctx)) {
      return true;
    }
    if (!runtime.requireAuthorized(ctx)) {
      return true;
    }

    try {
      const body = runtime.parseJson(await runtime.readBody(ctx.req));
      if (body.resumeThreadId && !body.resumeSessionId) {
        body.resumeSessionId = body.resumeThreadId;
      }
      const providerId = String(body.provider || "codex").trim().toLowerCase() || "codex";
      const resumeSessionId = String(body.resumeSessionId || "").trim();
      if (resumeSessionId) {
        const reusable = runtime.sessionManager.findRunningLiveSessionByResume(providerId, resumeSessionId);
        if (reusable) {
          runtime.json(ctx, 200, { session: reusable });
          return true;
        }
      }
      const session = runtime.sessionManager.create(body);
      console.log(
        `[session] created id=${session.id} provider=${session.provider} model=${session.model || ""} cwd=${session.cwd || ""} resume=${session.resumeSessionId || ""}`
      );
      runtime.json(ctx, 201, { session });
    } catch (err) {
      console.warn(`[session] create failed error=${err?.message || String(err)}`);
      runtime.json(ctx, 400, { error: err?.message || String(err) });
    }
    return true;
  }

  if (ctx.path.startsWith("/api/sessions/") && ctx.method === "PATCH") {
    if (runtime.forbidCrossOrigin(ctx)) {
      return true;
    }
    if (!runtime.requireAuthorized(ctx)) {
      return true;
    }

    const id = ctx.path.split("/").at(-1);
    try {
      const body = runtime.parseJson(await runtime.readBody(ctx.req));
      const session = runtime.sessionManager.rename(id, body.name);
      runtime.json(ctx, 200, { session });
    } catch (err) {
      runtime.json(ctx, 400, { error: err?.message || String(err) });
    }
    return true;
  }

  if (ctx.path.startsWith("/api/sessions/") && ctx.method === "DELETE") {
    if (runtime.forbidCrossOrigin(ctx)) {
      return true;
    }
    if (!runtime.requireAuthorized(ctx)) {
      return true;
    }

    const id = ctx.path.split("/").at(-1);
    const body = runtime.parseJson(await runtime.readBody(ctx.req));
    runtime.json(ctx, 200, {
      ok: runtime.sessionManager.deleteSession(id, {
        deleteHistory: Boolean(body.deleteHistory)
      })
    });
    return true;
  }

  if (ctx.path === "/api/health" && ctx.method === "GET") {
    runtime.json(ctx, 200, runtime.healthPayload());
    return true;
  }

  if (ctx.path === "/api/healthz" && ctx.method === "GET") {
    if (!runtime.requireAuthorized(ctx)) {
      return true;
    }

    runtime.json(ctx, 200, runtime.healthzPayload());
    return true;
  }

  if (ctx.path === "/api/metrics" && ctx.method === "GET") {
    if (!runtime.requireAuthorized(ctx)) {
      return true;
    }

    ctx.status = 200;
    ctx.set(runtime.responseHeaders());
    ctx.type = "text/plain; version=0.0.4; charset=utf-8";
    ctx.body = runtime.metricsPayload();
    return true;
  }

  if (ctx.path.startsWith("/api/sessions/") && ctx.path.endsWith("/resize") && ctx.method === "POST") {
    if (runtime.forbidCrossOrigin(ctx)) {
      return true;
    }
    if (!runtime.requireAuthorized(ctx)) {
      return true;
    }

    const parts = ctx.path.split("/");
    const id = parts[3];
    try {
      const body = runtime.parseJson(await runtime.readBody(ctx.req));
      runtime.sessionManager.resize(id, body.cols, body.rows);
      runtime.json(ctx, 200, { ok: true });
    } catch (err) {
      runtime.json(ctx, 400, { error: err?.message || String(err) });
    }
    return true;
  }

  return false;
}
