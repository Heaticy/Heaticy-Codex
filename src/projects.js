import fs from "node:fs";
import path from "node:path";

function readJsonFile(filePath, fallbackValue) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallbackValue;
  }
}

function stableProjectId(cwd) {
  return String(cwd || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-56) || "default";
}

function projectColor(id) {
  const colors = ["#38bdf8", "#5eead4", "#a3e635", "#f59e0b", "#f472b6", "#818cf8"];
  let total = 0;
  for (const char of String(id || "")) {
    total += char.charCodeAt(0);
  }
  return colors[total % colors.length];
}

/**
 * Small persistent Project index stored outside the repo.
 *
 * Example:
 * const store = new ProjectStore("/home/me/.heaticy-codex/projects.json");
 * const project = store.ensureForCwd("/repo/app");
 */
export class ProjectStore {
  constructor(projectsPath) {
    this.projectsPath = projectsPath;
    this.projects = readJsonFile(projectsPath, []);
  }

  save() {
    fs.mkdirSync(path.dirname(this.projectsPath), { recursive: true });
    fs.writeFileSync(this.projectsPath, JSON.stringify(this.projects, null, 2), "utf8");
  }

  list() {
    return [...this.projects].sort((left, right) =>
      String(right.lastActiveAt || "").localeCompare(String(left.lastActiveAt || ""))
    );
  }

  ensureForCwd(cwd) {
    const resolved = path.resolve(String(cwd || process.cwd()));
    const existing = this.projects.find((project) => project.cwd === resolved);
    const now = new Date().toISOString();
    if (existing) {
      existing.lastActiveAt = now;
      this.save();
      return existing;
    }
    const id = stableProjectId(resolved);
    const project = {
      id,
      label: path.basename(resolved) || resolved,
      cwd: resolved,
      icon: "folder",
      color: projectColor(id),
      lastActiveAt: now
    };
    this.projects.push(project);
    this.save();
    return project;
  }
}

export const testInternals = {
  stableProjectId,
  projectColor
};
