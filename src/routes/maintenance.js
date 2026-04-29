export async function handleMaintenanceRoute(ctx, runtime) {
  if (ctx.path === "/api/maintenance/report" && ctx.method === "GET") {
    if (!runtime.requireAuthorized(ctx)) {
      return true;
    }

    runtime.json(ctx, 200, { report: runtime.sessionManager.getMaintenanceReport() });
    return true;
  }

  if (ctx.path === "/api/maintenance/cleanup" && ctx.method === "POST") {
    if (runtime.forbidCrossOrigin(ctx)) {
      return true;
    }
    if (!runtime.requireAuthorized(ctx)) {
      return true;
    }

    try {
      runtime.json(ctx, 200, { report: runtime.sessionManager.runHistoricalCleanup({ trigger: "manual" }) });
    } catch (err) {
      runtime.json(ctx, 500, { error: err?.message || String(err) });
    }
    return true;
  }

  return false;
}
