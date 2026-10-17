import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { createServer } from './index.js';
import {
  readConfiguration,
  readTlsMaterial,
  frontendEnvironment,
  ConfigurationError,
} from './config.js';

async function startVite(
  directory: string,
  env: NodeJS.ProcessEnv,
): Promise<ChildProcess> {
  const web = resolve(directory, 'apps/web');
  const require = createRequire(resolve(web, 'package.json'));
  const cli = resolve(require.resolve('vite/package.json'), '../bin/vite.js');
  const child = spawn(
    process.execPath,
    [cli, '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
    {
      cwd: web,
      env: { ...frontendEnvironment(env), NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    },
  );
  let ended = false;
  child.once('error', () => {
    ended = true;
  });
  child.once('exit', () => {
    ended = true;
  });
  let output = '';
  let ready = false;
  child.stdout?.on('data', (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-4096);
    ready ||= /Local:\s+http:\/\/127\.0\.0\.1:5173\//.test(output);
  });
  try {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (ended) throw new Error('DEV_HELPER_FAILED');
      if (ready) return child;
      await delay(100);
    }
    throw new Error('DEV_HELPER_TIMEOUT');
  } catch {
    child.kill();
    throw new ConfigurationError(
      'DEV_HELPER',
      'Vite could not start on the reserved loopback port 5173.',
    );
  }
}

export async function startDesk(
  kind: 'built' | 'dev',
  directory: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const config = readConfiguration(env);
  const tls = readTlsMaterial(config, directory);
  const child = kind === 'dev' ? await startVite(directory, env) : undefined;
  let current: Awaited<ReturnType<typeof createServer>> | undefined;
  let helperExited = false;
  child?.once('exit', () => {
    helperExited = true;
    void current?.server.close().catch(() => {});
  });
  try {
    current = await createServer({
      tls,
      origin: config.origin,
      web:
        kind === 'dev'
          ? { kind: 'dev', upstreamPort: 5173 }
          : { kind: 'built', directory: resolve(directory, 'apps/web/dist') },
    });
    await current.server.listen({ host: config.host, port: config.port });
    if (helperExited) throw new Error('DEV_HELPER_EXITED');
    const { server, application } = current;
    let stopped = false;
    const close = async () => {
      if (stopped) return;
      stopped = true;
      child?.kill();
      await server.close();
    };
    child?.once('exit', () => {
      void close();
    });
    return { server, application, origin: config.origin, close };
  } catch {
    child?.kill();
    await current?.server.close();
    throw new ConfigurationError(
      'START_FAILED',
      'HTTPS could not start. Check certificate files, the frontend build and whether the loopback port is already in use.',
    );
  }
}
