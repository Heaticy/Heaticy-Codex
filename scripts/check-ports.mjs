#!/usr/bin/env node
import { findAvailablePort, resolvePortChoice } from "./lib/ports.mjs";

function parseArgs(argv) {
  const options = {
    host: "0.0.0.0",
    ports: [],
    labels: [],
    suggestFrom: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--host") {
      options.host = argv[index + 1] || options.host;
      index += 1;
      continue;
    }
    if (arg === "--port") {
      options.ports.push(argv[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg === "--label") {
      options.labels.push(argv[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg === "--suggest-from") {
      options.suggestFrom = argv[index + 1] || null;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.suggestFrom) {
    const port = await findAvailablePort(options.suggestFrom, { host: options.host });
    if (!port) {
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${port}\n`);
    return;
  }

  const seen = new Map();
  let ok = true;
  for (let index = 0; index < options.ports.length; index += 1) {
    const requested = options.ports[index];
    const label = options.labels[index] || `port ${index + 1}`;
    const duplicate = seen.get(String(requested));
    if (duplicate) {
      console.error(`[ports] ${label}=${requested} duplicates ${duplicate}; choose a different port.`);
      ok = false;
      continue;
    }
    seen.set(String(requested), label);

    const choice = await resolvePortChoice(requested, { host: options.host });
    if (choice.status === "available") {
      continue;
    }

    ok = false;
    if (choice.status === "invalid") {
      console.error(`[ports] ${label}=${requested} is not a valid TCP port.`);
      continue;
    }

    const recommendation = choice.recommendedPort ? ` Recommended: ${choice.recommendedPort}.` : "";
    console.error(`[ports] ${label}=${choice.port} is already in use on ${options.host}.${recommendation}`);
  }

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
