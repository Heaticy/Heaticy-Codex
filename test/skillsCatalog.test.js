import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  SkillCatalog,
  buildSkillAliases,
  discoverSkills,
  resolveSkillAlias
} from "../src/skillsCatalog.js";
import { createKoaApp } from "../src/koa-app.js";
import { config as baseConfig } from "../src/config.js";

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeSkill(codexHome, relativePath, frontmatter) {
  writeFile(
    path.join(codexHome, "skills", relativePath, "SKILL.md"),
    `---\nname: ${frontmatter.name}\ndescription: ${frontmatter.description}\n---\n\n# ${frontmatter.name}\n`
  );
}

function createSessionManagerStub() {
  return {
    listAll: () => [],
    listProjects: () => [],
    listCodexThreads: () => [],
    stats: () => ({ running: 0, archived: 0, total: 0 }),
    observability: () => ({
      bridgeReady: true,
      activeRunners: 0,
      lastErrorAt: null,
      turns: { completed: 0, failed: 0 },
      approvals: { allow: 0, deny: 0, auto_allow: 0 }
    })
  };
}

async function withServer(codexHome, fn) {
  const { app } = createKoaApp({
    config: {
      ...baseConfig,
      accessToken: "test-token",
      codexHome,
      trustedCidrs: [],
      secureCookies: false,
      authSessionCookieName: "test_auth"
    },
    sessionManager: createSessionManagerStub()
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "test-token" })
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie");
}

test("discovers installed skills from Codex home with canonical names and aliases", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "heaticy-skills-"));
  writeSkill(root, ".system/openai-docs", {
    name: "openai-docs",
    description: "Use official OpenAI documentation."
  });
  writeSkill(root, "frontend-skill", {
    name: "frontend-skill",
    description: "Build polished frontend experiences."
  });
  writeSkill(root, "hypo-workflow/skills/plan", {
    name: "plan",
    description: "Enter Hypo-Workflow planning mode."
  });
  writeFile(path.join(root, "skills", "broken", "SKILL.md"), "---\nname: broken\n");

  const skills = discoverSkills({ codexHome: root });
  assert.deepEqual(
    skills.map((skill) => skill.name),
    ["frontend-skill", "hypo-workflow:plan", "openai-docs"]
  );
  assert.equal(skills.find((skill) => skill.name === "openai-docs").source, ".system");
  assert.equal(skills.find((skill) => skill.name === "hypo-workflow:plan").description, "Enter Hypo-Workflow planning mode.");
  assert.ok(skills.find((skill) => skill.name === "hypo-workflow:plan").aliases.includes("hw:plan"));
});

test("builds aliases and resolves only unique alias matches", () => {
  assert.deepEqual(buildSkillAliases("hypo-workflow:plan"), ["hw:plan"]);
  assert.equal(
    resolveSkillAlias("$hw:plan", [
      { name: "hypo-workflow:plan", aliases: ["hw:plan"] },
      { name: "frontend-skill", aliases: ["fs"] }
    ]),
    "$hypo-workflow:plan"
  );
  assert.equal(
    resolveSkillAlias("$hw:plan", [
      { name: "hypo-workflow:plan", aliases: ["hw:plan"] },
      { name: "hello-world:plan", aliases: ["hw:plan"] }
    ]),
    "$hw:plan"
  );
});

test("skill catalog caches results until refresh is requested", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "heaticy-skills-cache-"));
  writeSkill(root, "alpha-skill", {
    name: "alpha-skill",
    description: "Alpha skill."
  });
  const catalog = new SkillCatalog({ codexHome: root, ttlMs: 60_000 });

  assert.deepEqual(catalog.list().map((skill) => skill.name), ["alpha-skill"]);
  writeSkill(root, "beta-skill", {
    name: "beta-skill",
    description: "Beta skill."
  });
  assert.deepEqual(catalog.list().map((skill) => skill.name), ["alpha-skill"]);
  assert.deepEqual(catalog.list({ refresh: true }).map((skill) => skill.name), ["alpha-skill", "beta-skill"]);
});

test("skills API requires authorization and returns discovered skills", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "heaticy-skills-api-"));
  writeSkill(root, "hypo-workflow/skills/plan", {
    name: "plan",
    description: "Enter Hypo-Workflow planning mode."
  });

  await withServer(root, async (baseUrl) => {
    const anonymous = await fetch(`${baseUrl}/api/skills`);
    assert.equal(anonymous.status, 401);

    const cookie = await login(baseUrl);
    const response = await fetch(`${baseUrl}/api/skills?refresh=1`, {
      headers: { Cookie: cookie }
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.skills.map((skill) => skill.name), ["hypo-workflow:plan"]);
    assert.deepEqual(payload.skills[0].aliases, ["hw:plan"]);
  });
});
