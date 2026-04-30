import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_TTL_MS = 5_000;
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;

function defaultCodexHome() {
  return process.env.CODEX_HOME || path.join(process.env.HOME || os.homedir(), ".codex");
}

function normalizeSkillName(value) {
  return String(value || "")
    .trim()
    .replace(/^\$+/, "")
    .toLowerCase();
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function parseFrontmatter(content) {
  const match = String(content || "").match(FRONTMATTER_RE);
  if (!match) {
    return {};
  }
  const result = {};
  for (const line of match[1].split("\n")) {
    const item = line.match(/^\s*([A-Za-z0-9_.-]+)\s*:\s*(.*?)\s*$/);
    if (!item) {
      continue;
    }
    const key = item[1];
    const rawValue = item[2].trim();
    result[key] = rawValue.replace(/^["']|["']$/g, "").trim();
  }
  return result;
}

function acronym(value) {
  const parts = String(value || "")
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean);
  if (parts.length < 2) {
    return "";
  }
  return parts.map((part) => part[0]).join("").toLowerCase();
}

export function buildSkillAliases(name) {
  const normalized = normalizeSkillName(name);
  if (!normalized) {
    return [];
  }

  const aliases = [];
  if (normalized.includes(":")) {
    const [namespace, child] = normalized.split(":", 2);
    const namespaceAlias = acronym(namespace);
    if (namespaceAlias && child) {
      aliases.push(`${namespaceAlias}:${child}`);
    }
    return unique(aliases).filter((alias) => alias !== normalized);
  }

  const alias = acronym(normalized);
  if (alias) {
    aliases.push(alias);
  }
  return unique(aliases).filter((item) => item !== normalized);
}

function deriveCanonicalName(skillsDir, skillPath, metadata) {
  const relativeDir = path.relative(skillsDir, path.dirname(skillPath));
  const parts = relativeDir.split(path.sep).filter(Boolean);
  const frontmatterName = normalizeSkillName(metadata.name);
  if (parts.length >= 3 && parts.at(-2) === "skills") {
    const namespace = normalizeSkillName(parts.at(-3));
    const child = frontmatterName || normalizeSkillName(parts.at(-1));
    return namespace && child ? `${namespace}:${child}` : "";
  }
  return frontmatterName || normalizeSkillName(parts.at(-1));
}

function sourceForSkill(skillsDir, skillPath) {
  const relativeDir = path.relative(skillsDir, path.dirname(skillPath));
  const first = relativeDir.split(path.sep).filter(Boolean)[0] || "";
  return first === ".system" ? ".system" : "user";
}

function findSkillFiles(rootDir) {
  const files = [];
  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        files.push(fullPath);
      }
    }
  }
  walk(rootDir);
  return files;
}

export function discoverSkills({ codexHome = defaultCodexHome() } = {}) {
  const skillsDir = path.join(codexHome, "skills");
  const byName = new Map();
  for (const filePath of findSkillFiles(skillsDir)) {
    try {
      const metadata = parseFrontmatter(fs.readFileSync(filePath, "utf8"));
      if (!metadata.description) {
        continue;
      }
      const name = deriveCanonicalName(skillsDir, filePath, metadata);
      if (!name) {
        continue;
      }
      const description = String(metadata.description || "").trim();
      byName.set(name, {
        name,
        description,
        path: filePath,
        aliases: buildSkillAliases(name),
        source: sourceForSkill(skillsDir, filePath)
      });
    } catch {
      // Ignore a single unreadable or malformed skill; the catalog should still load.
    }
  }
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function resolveSkillAlias(token, skills = []) {
  const text = String(token || "");
  const hasDollar = text.startsWith("$");
  const normalized = normalizeSkillName(text);
  if (!normalized) {
    return text;
  }
  if (skills.some((skill) => normalizeSkillName(skill.name) === normalized)) {
    return `${hasDollar ? "$" : ""}${normalized}`;
  }
  const matches = skills.filter((skill) =>
    (skill.aliases || []).some((alias) => normalizeSkillName(alias) === normalized)
  );
  if (matches.length !== 1) {
    return text;
  }
  return `${hasDollar ? "$" : ""}${matches[0].name}`;
}

export class SkillCatalog {
  constructor({ codexHome = defaultCodexHome(), ttlMs = DEFAULT_TTL_MS } = {}) {
    this.codexHome = codexHome;
    this.ttlMs = ttlMs;
    this.cache = null;
    this.loadedAt = 0;
  }

  list({ refresh = false } = {}) {
    const now = Date.now();
    if (!refresh && this.cache && now - this.loadedAt < this.ttlMs) {
      return this.cache;
    }
    this.cache = discoverSkills({ codexHome: this.codexHome });
    this.loadedAt = now;
    return this.cache;
  }
}
