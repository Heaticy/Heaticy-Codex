import test from "node:test";
import assert from "node:assert/strict";

import {
  applySkillCompletion,
  filterSkillCompletions,
  findSkillToken,
  normalizeSkillAliases
} from "../web/src/lib/skill-completion.js";

const skills = [
  {
    name: "hypo-workflow:plan",
    description: "Enter Hypo-Workflow planning mode.",
    aliases: ["hw:plan"]
  },
  {
    name: "frontend-skill",
    description: "Build polished frontend experiences.",
    aliases: ["fs"]
  },
  {
    name: "openai-docs",
    description: "Use official OpenAI documentation.",
    aliases: ["od"]
  }
];

test("finds dollar-prefixed token at the current cursor position", () => {
  assert.deepEqual(findSkillToken("$", 1), { start: 0, end: 1, query: "", raw: "$" });
  assert.deepEqual(findSkillToken("$h", 2), { start: 0, end: 2, query: "h", raw: "$h" });
  assert.deepEqual(findSkillToken("请用 $hypo", "请用 $hypo".length), {
    start: 3,
    end: 8,
    query: "hypo",
    raw: "$hypo"
  });
  assert.equal(findSkillToken("price is $12", "price is $12".length), null);
  assert.equal(findSkillToken("echo $PATH", "echo $PATH".length), null);
});

test("filters candidates by canonical name, alias, and description", () => {
  assert.deepEqual(filterSkillCompletions(skills, "").map((skill) => skill.name), [
    "frontend-skill",
    "hypo-workflow:plan",
    "openai-docs"
  ]);
  assert.deepEqual(filterSkillCompletions(skills, "h").map((skill) => skill.name), ["hypo-workflow:plan"]);
  assert.deepEqual(filterSkillCompletions(skills, "hw:p").map((skill) => skill.name), ["hypo-workflow:plan"]);
  assert.deepEqual(filterSkillCompletions(skills, "official").map((skill) => skill.name), ["openai-docs"]);
});

test("applies selected completion to only the current token", () => {
  assert.deepEqual(applySkillCompletion("请用 $hypo 完成", 8, skills[0]), {
    text: "请用 $hypo-workflow:plan 完成",
    cursor: 22
  });
});

test("normalizes unique aliases without changing conflicts or non-skill dollar text", () => {
  assert.equal(normalizeSkillAliases("请用 $hw:plan", skills), "请用 $hypo-workflow:plan");
  assert.equal(normalizeSkillAliases("echo $PATH && pay $12", skills), "echo $PATH && pay $12");
  assert.equal(
    normalizeSkillAliases("请用 $hw:plan", [
      ...skills,
      { name: "hello-world:plan", description: "Conflict", aliases: ["hw:plan"] }
    ]),
    "请用 $hw:plan"
  );
});
