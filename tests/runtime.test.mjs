import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDesk } from '../apps/server/dist/runtime.js';
import { frontendEnvironment } from '../apps/server/dist/config.js';
import { fixture, get } from './helpers/https.mjs';

async function runtimeEnv(data) {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((done) => listener.close(done));
  return {
    ...data.env,
    DESK_PORT: String(port),
    DESK_ORIGIN: `https://127.0.0.1:${port}`,
    DESK_TLS_CERT_PATH: join(data.directory, 'local.pem'),
    DESK_TLS_KEY_PATH: join(data.directory, 'local.key'),
  };
}

test('configured built runtime serves TLS and releases its loopback listener', async () => {
  const data = await fixture();
  const directory = join(data.directory, 'apps/web/dist');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'index.html'), '<h1>built fixture</h1>');
  const env = await runtimeEnv(data);
  const desk = await startDesk('built', data.directory, env);
  try {
    assert.equal(desk.server.server.address().address, '127.0.0.1');
    assert.equal((await get(desk.origin, data.pems.cert)).status, 200);
  } finally {
    await desk.close();
  }
  await assert.rejects(get(desk.origin, data.pems.cert));
});

test('actual Vite child is reachable through HTTPS with secrets isolated and fails closed on a busy helper port', async () => {
  const data = await fixture();
  const env = {
    ...frontendEnvironment(process.env),
    ...(await runtimeEnv(data)),
    POLYMARKET_API_KEY: 'test-only-private-sentinel',
  };
  const root = fileURLToPath(new URL('../', import.meta.url));
  const desk = await startDesk('dev', root, env);
  try {
    assert.equal((await get(desk.origin, data.pems.cert)).status, 200);
    const client = await get(desk.origin + '/@vite/client', data.pems.cert);
    assert.equal(client.status, 200);
    assert.ok(client.body.includes('WebSocket'));
    const source = await get(desk.origin + '/src/main.tsx', data.pems.cert);
    assert.equal(source.status, 200);
    assert.ok(!source.body.includes('test-only-private-sentinel'));
    assert.equal(
      (await get(desk.origin + '/api/unknown', data.pems.cert)).status,
      404,
    );
    assert.equal(
      (await get(desk.origin + '/.env', data.pems.cert)).status,
      404,
    );
    await assert.rejects(
      startDesk('dev', root, env),
      (error) => error.code === 'DEV_HELPER',
    );
  } finally {
    await desk.close();
  }
});
