#!/usr/bin/env node
import { spawn } from 'child_process';
import { loadEnvFile } from './localMongoUtils.mjs';

async function main() {
  const [envFilePath, command, ...args] = process.argv.slice(2);
  if (!envFilePath || !command) {
    throw new Error('Usage: node scripts/dev/run-with-env.mjs <env-file> <command> [...args]');
  }

  const envFile = await loadEnvFile(envFilePath);
  if (!envFile.exists) {
    throw new Error(`Missing env file: ${envFile.path}. Copy the matching *.example file first.`);
  }

  const child = spawn(command, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...envFile.values,
    },
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(`[run-with-env] ${error.message}`);
  process.exit(1);
});
