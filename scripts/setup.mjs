#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolvePortChoice } from './lib/ports.mjs';

const rl = createInterface({ input, output });
const projectRoot = process.cwd();
const envExamplePath = path.join(projectRoot, '.env.example');
const envPath = path.join(projectRoot, '.env');
const npmCommand = 'npm';

function logStep(title) {
  output.write(`\n=== ${title} ===\n`);
}

function askYesNo(question, defaultYes = true) {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  return rl.question(`${question} ${hint} `).then((raw) => {
    const v = raw.trim().toLowerCase();
    if (!v) return defaultYes;
    return v === 'y' || v === 'yes';
  });
}

function askWithDefault(question, fallback) {
  return rl.question(`${question} (${fallback}) `).then((raw) => {
    const v = raw.trim();
    return v || fallback;
  });
}

function parseEnv(content) {
  const map = new Map();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    map.set(key, value);
  }
  return map;
}

function toEnvContent(map) {
  return `${Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('\n')}\n`;
}

function validPort(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

async function askPort(question, current, { host = '0.0.0.0', otherPort = null } = {}) {
  let port = await askWithDefault(question, current);
  while (true) {
    if (!validPort(port)) {
      port = await askWithDefault('端口无效，请输入 1-65535 的整数端口', current);
      continue;
    }

    if (otherPort && String(port) === String(otherPort)) {
      output.write(`端口 ${port} 已被本次配置的另一个服务使用，请换一个端口。\n`);
      port = await askWithDefault(question, String(Number(port) + 1));
      continue;
    }

    const choice = await resolvePortChoice(port, { host });
    if (choice.status === 'available') {
      return String(choice.port);
    }

    if (choice.status === 'occupied') {
      if (!choice.recommendedPort) {
        output.write(`端口 ${choice.port} 已被占用，且没有在附近找到可用端口。\n`);
        port = await askWithDefault(question, String(Number(port) + 1));
        continue;
      }

      output.write(`端口 ${choice.port} 已被占用，推荐使用 ${choice.recommendedPort}。\n`);
      const useRecommended = await askYesNo(`是否改用 ${choice.recommendedPort}？`, true);
      port = useRecommended ? String(choice.recommendedPort) : await askWithDefault(question, String(choice.recommendedPort));
      continue;
    }

    port = await askWithDefault('端口无效，请输入 1-65535 的整数端口', current);
  }
}

async function main() {
  output.write('Heaticy Codex 一键安装向导\n');
  output.write(`目录: ${projectRoot}\n`);

  logStep('环境检查');
  const nodeVersion = process.version;
  output.write(`Node: ${nodeVersion}\n`);

  const codexVersion = spawnSync('codex', ['--version'], { encoding: 'utf8' });
  if (codexVersion.status !== 0 || !codexVersion.stdout.trim()) {
    output.write('未检测到 codex 命令。请先安装 codex，再执行 npm run setup。\n');
    await rl.close();
    process.exit(1);
  }
  output.write(`Codex: ${codexVersion.stdout.trim()}\n`);

  logStep('读取配置模板');
  if (!existsSync(envExamplePath)) {
    output.write('未找到 .env.example，无法继续。\n');
    await rl.close();
    process.exit(1);
  }

  const base = parseEnv(readFileSync(envExamplePath, 'utf8'));
  if (existsSync(envPath)) {
    const useCurrent = await askYesNo('检测到已有 .env，是否在现有配置上修改？', true);
    if (useCurrent) {
      const current = parseEnv(readFileSync(envPath, 'utf8'));
      for (const [k, v] of current.entries()) {
        base.set(k, v);
      }
    }
  }

  logStep('交互式配置');
  const host = await askWithDefault('监听地址 HOST', base.get('HOST') || '0.0.0.0');
  base.set('HOST', host);

  const currentPort = base.get('PORT') || '3211';
  const port = await askPort('服务端口 PORT', currentPort, { host });
  base.set('PORT', port);

  const currentWebPort = base.get('WEB_PORT') || '5206';
  const webPort = await askPort('前端端口 WEB_PORT', currentWebPort, { host, otherPort: port });
  base.set('WEB_PORT', webPort);

  const tokenHint = base.get('ACCESS_TOKEN') && base.get('ACCESS_TOKEN') !== 'change-me' ? '保持当前' : '请输入';
  let token = await rl.question(`访问令牌 ACCESS_TOKEN（${tokenHint}）: `);
  token = token.trim() || base.get('ACCESS_TOKEN') || '';
  while (!token || token === 'change-me') {
    token = (await rl.question('ACCESS_TOKEN 不能为空且不能是 change-me，请重新输入: ')).trim();
  }
  base.set('ACCESS_TOKEN', token);

  const trustedCidrs = await askWithDefault('允许访问的网段 TRUSTED_CIDRS（逗号分隔，可留空）', base.get('TRUSTED_CIDRS') || '');
  base.set('TRUSTED_CIDRS', trustedCidrs);

  const timezone = await askWithDefault('展示时区 DISPLAY_TIMEZONE', base.get('DISPLAY_TIMEZONE') || 'Asia/Shanghai');
  base.set('DISPLAY_TIMEZONE', timezone);

  const defaultCwd = await askWithDefault('默认工作目录 DEFAULT_CWD（可留空）', base.get('DEFAULT_CWD') || projectRoot);
  base.set('DEFAULT_CWD', defaultCwd);

  logStep('写入 .env');
  writeFileSync(envPath, toEnvContent(base), 'utf8');
  output.write(`已写入: ${envPath}\n`);

  const installDeps = await askYesNo('现在安装依赖（npm install）？', true);
  if (installDeps) {
    logStep('安装依赖');
    const ret = spawnSync(npmCommand, ['install'], { stdio: 'inherit' });
    if (ret.status !== 0) {
      output.write('npm install 失败，请修复后重试。\n');
      await rl.close();
      process.exit(ret.status ?? 1);
    }
  }

  const startScript = 'dev:up';
  const startNow = await askYesNo(`现在启动开发服务（npm run ${startScript}）？`, true);
  if (startNow) {
    logStep('启动服务');
    const ret = spawnSync(npmCommand, ['run', startScript], { stdio: 'inherit' });
    if (ret.status !== 0) {
      output.write('启动失败，请查看日志排查。\n');
      await rl.close();
      process.exit(ret.status ?? 1);
    }
  }

  logStep('完成');
  output.write('配置完成。\n');
  output.write(`前端: http://127.0.0.1:${webPort}/#/sessions\n`);
  output.write(`后端: http://127.0.0.1:${port}\n`);
  output.write('如需查看日志: tail -f /tmp/codex-server-dev.log /tmp/codex-web-dev.log\n');

  await rl.close();
}

main().catch(async (err) => {
  output.write(`\n安装向导异常: ${err instanceof Error ? err.message : String(err)}\n`);
  await rl.close();
  process.exit(1);
});
