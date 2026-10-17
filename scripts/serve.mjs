import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
let isConfigurationError = () => false;
try {
  const { startDesk } = await import('../apps/server/dist/runtime.js');
  const { ConfigurationError } = await import('../apps/server/dist/config.js');
  isConfigurationError = (error) => error instanceof ConfigurationError;
  const command = process.argv[2];
  if (command !== 'start' && command !== 'dev') throw new Error('COMMAND');
  const envFile = resolve(root, '.env');
  if (existsSync(envFile)) loadEnvFile(envFile);
  const desk = await startDesk(command === 'dev' ? 'dev' : 'built', root);
  console.log('Trading Desk: ' + desk.origin + ' (OBSERVE)');
  const stop = () => {
    void desk.close().then(() => {
      process.exitCode = 0;
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  console.error(
    isConfigurationError(error)
      ? error.message
      : 'START_FAILED: Check the build, server .env syntax and local HTTPS setup guide.',
  );
  process.exitCode = 1;
}
