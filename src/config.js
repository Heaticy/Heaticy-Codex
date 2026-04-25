import "dotenv/config";

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

function env(name, fallback = "") {
  const value = process.env[name];
  if (value === undefined || value === null) {
    return fallback;
  }

  const trimmed = String(value).trim();
  return trimmed || fallback;
}

function intEnv(name, fallback) {
  const parsed = Number.parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolEnv(name, fallback = false) {
  const value = env(name, fallback ? "1" : "0").toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function listEnv(name) {
  return env(name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readCodexConfigModel(codexHome) {
  try {
    const configPath = path.join(codexHome, "config.toml");
    const content = fs.readFileSync(configPath, "utf8");
    const match = content.match(/^\s*model\s*=\s*["']([^"']+)["']/m);
    return String(match?.[1] || "").trim();
  } catch {
    return "";
  }
}

function inferShellBin() {
  if (process.platform === "darwin") {
    return env("SHELL", "/bin/zsh");
  }

  return env("SHELL", "/bin/bash");
}

function inferShellArgs() {
  return ["-l"];
}

function inferShellQuoteStyle() {
  return "posix";
}

const root = process.cwd();
const home = process.env.HOME || os.homedir();
const codexHome = env("CODEX_HOME", path.join(home, ".codex"));
const generatedToken = crypto.randomBytes(18).toString("base64url");
const shellBin = env("SHELL_BIN", inferShellBin());
const shellArgs = env("SHELL_ARGS") ? listEnv("SHELL_ARGS") : inferShellArgs();

export const config = {
  root,
  home,
  platform: process.platform,
  host: env("HOST", "0.0.0.0"),
  port: intEnv("PORT", 3211),
  accessToken: env("ACCESS_TOKEN", generatedToken),
  defaultCwd: env("DEFAULT_CWD", home),
  shellBin,
  shellArgs,
  shellQuoteStyle: env("SHELL_QUOTE_STYLE", inferShellQuoteStyle()),
  codexBin: env("CODEX_BIN", "codex"),
  codexModel: env("CODEX_MODEL", readCodexConfigModel(codexHome)),
  codexModels: listEnv("CODEX_MODELS"),
  codexProfile: env("CODEX_PROFILE", ""),
  codexFullAccess: boolEnv("CODEX_FULL_ACCESS", true),
  codexNoAltScreen: boolEnv("CODEX_NO_ALT_SCREEN", true),
  codexExtraArgs: listEnv("CODEX_EXTRA_ARGS"),
  codexAppServerEnabled: boolEnv("CODEX_APP_SERVER_ENABLED", true),
  codexAppServerTransport: env("CODEX_APP_SERVER_TRANSPORT", "stdio").toLowerCase(),
  codexAppServerListenUrl: env("CODEX_APP_SERVER_LISTEN_URL", "ws://127.0.0.1:8777"),
  codexAppServerConnectTimeoutMs: intEnv("CODEX_APP_SERVER_CONNECT_TIMEOUT_MS", 10_000),
  codexAppServerRequestTimeoutMs: intEnv("CODEX_APP_SERVER_REQUEST_TIMEOUT_MS", 45_000),
  ccBin: env("CC_BIN", "claude"),
  ccModel: env("CC_MODEL", ""),
  ccModels: listEnv("CC_MODELS"),
  ccFullAccess: boolEnv("CC_FULL_ACCESS", true),
  ccExtraArgs: listEnv("CC_EXTRA_ARGS"),
  authSessionCookieName: env("AUTH_SESSION_COOKIE_NAME", "heaticy_codex_session"),
  authSessionTtlMs: intEnv("AUTH_SESSION_TTL_HOURS", 24) * 60 * 60 * 1000,
  secureCookies: boolEnv("SECURE_COOKIES", false),
  authRateLimitWindowMs: intEnv("AUTH_RATE_LIMIT_WINDOW_MINUTES", 10) * 60 * 1000,
  authRateLimitMaxAttempts: intEnv("AUTH_RATE_LIMIT_MAX_ATTEMPTS", 5),
  authRateLimitBlockMs: intEnv("AUTH_RATE_LIMIT_BLOCK_MINUTES", 15) * 60 * 1000,
  trustedCidrs: listEnv("TRUSTED_CIDRS"),
  wsHeartbeatMs: intEnv("WS_HEARTBEAT_SECONDS", 30) * 1000,
  sessionBufferLimit: 250000,
  sessionEventBufferSize: intEnv("SESSION_EVENT_BUFFER_SIZE", 500),
  sessionEventBufferTtlMs: intEnv("SESSION_EVENT_BUFFER_TTL_MINUTES", 5) * 60 * 1000,
  sessionDetachedTtlMs: intEnv("SESSION_DETACHED_TTL_HOURS", 6) * 60 * 60 * 1000,
  stallWarningMs: intEnv("SESSION_STALL_WARNING_SECONDS", 30) * 1000,
  maxQueuedInputs: intEnv("MAX_QUEUED_INPUTS", 200),
  dataDir: path.join(root, "data"),
  heaticyDataDir: env("HEATICY_CODEX_HOME", path.join(home, ".heaticy-codex")),
  codexHome,
  codexSessionsDir: env("CODEX_SESSIONS_DIR", path.join(codexHome, "sessions")),
  ccSessionsDir: env("CC_SESSIONS_DIR", path.join(home, ".claude", "projects")),
  timezone: env("DISPLAY_TIMEZONE", "Australia/Melbourne")
};
