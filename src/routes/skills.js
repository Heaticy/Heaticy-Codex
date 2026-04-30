import { SkillCatalog } from "../skillsCatalog.js";

let catalog = null;

function getCatalog(runtime) {
  const codexHome = runtime.config.codexHome;
  if (!catalog || catalog.codexHome !== codexHome) {
    catalog = new SkillCatalog({ codexHome });
  }
  return catalog;
}

export async function handleSkillsRoute(ctx, runtime) {
  if (ctx.path !== "/api/skills" || ctx.method !== "GET") {
    return false;
  }

  if (!runtime.requireAuthorized(ctx)) {
    return true;
  }

  const url = new URL(ctx.url, "http://localhost");
  const refresh = url.searchParams.get("refresh") === "1";
  runtime.json(ctx, 200, {
    skills: getCatalog(runtime).list({ refresh })
  });
  return true;
}
