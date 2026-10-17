import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from '../apps/server/dist/index.js';
import { publicWebPath } from '../apps/server/dist/web.js';
import { fixture, get } from './helpers/https.mjs';

test('built UI and SPA routes use a real TLS listener bound only to IPv4 loopback', async () => {
  const data = await fixture();
  mkdirSync(join(data.directory, 'web'));
  writeFileSync(
    join(data.directory, 'web/index.html'),
    '<h1>test-only UI</h1>',
  );
  writeFileSync(
    join(data.directory, 'web/app.js'),
    'export const testOnly = true;',
  );
  const { server } = await createServer({
    tls: data.tls,
    web: { kind: 'built', directory: join(data.directory, 'web') },
  });
  try {
    await server.listen({ host: '127.0.0.1', port: 0 });
    assert.equal(server.server.address().address, '127.0.0.1');
    const url = 'https://127.0.0.1:' + server.server.address().port;
    const page = await get(url + '/markets', data.pems.cert);
    assert.equal(page.status, 200);
    assert.ok(page.body.includes('test-only UI'));
    assert.ok(
      page.headers['content-security-policy'].includes(
        "frame-ancestors 'none'",
      ),
    );
    assert.equal(
      (await get(url + '/app.js', data.pems.cert)).headers['content-type'],
      'text/javascript; charset=utf-8',
    );
    for (const route of [
      '/api/v1/auth/session',
      '/api/unknown',
      '/health/ready',
      '/api/v1/stream/public',
      '/%61pi/unknown',
      '/.env',
      '/local.key',
      '/missing.js',
    ]) {
      assert.equal((await get(url + route, data.pems.cert)).status, 404, route);
    }
    await assert.rejects(get(url, undefined)); // no trust-all/rejectUnauthorized=false
  } finally {
    await server.close();
  }
});

test('development proxy strips credentials/cookies while keeping API and SSE routes local', async () => {
  const data = await fixture();
  const seen = [];
  const upstream = createHttpServer((request, response) => {
    seen.push({ url: request.url, headers: request.headers });
    response.setHeader('Set-Cookie', ['unsafe=one', 'unsafe=two']);
    response.setHeader('Content-Type', 'text/html');
    response.end('<h1>test-only upstream</h1>');
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const { server } = await createServer({
    tls: data.tls,
    origin: 'https://127.0.0.1:8443',
    web: { kind: 'dev', upstreamPort: upstream.address().port },
  });
  // Only fixtures, not implementation of wallet authentication.
  server.post('/api/v1/auth/verify', async (_request, reply) =>
    reply
      .header(
        'Set-Cookie',
        'desk_session=test-only; HttpOnly; Secure; SameSite=Strict; Path=/',
      )
      .send({ fixture: true }),
  );
  server.get('/api/v1/auth/session', async () => ({ fixture: true }));
  server.post('/api/v1/auth/logout', async (_request, reply) =>
    reply
      .header(
        'Set-Cookie',
        'desk_session=; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Path=/',
      )
      .send({ fixture: true }),
  );
  try {
    await server.listen({ host: '127.0.0.1', port: 0 });
    const url = 'https://127.0.0.1:' + server.server.address().port;
    const headers = {
      host: '127.0.0.1:8443',
      cookie: 'desk_session=never-upstream',
      authorization: 'Bearer never-upstream',
      'x-csrf-token': 'never-upstream',
    };
    const page = await get(url + '/', data.pems.cert, { headers });
    assert.equal(page.status, 200);
    assert.equal(page.headers['set-cookie'], undefined);
    assert.equal(seen[0].headers.cookie, undefined);
    assert.equal(seen[0].headers.authorization, undefined);
    assert.equal(seen[0].headers['x-csrf-token'], undefined);
    for (const route of [
      '/api/unknown',
      '/health/live',
      '/api/v1/stream/public',
      '/api/v1/stream/session',
      '/%61pi/unknown',
    ]) {
      assert.equal(
        (await get(url + route, data.pems.cert, { headers })).status,
        404,
        route,
      );
    }
    for (const [route, method] of [
      ['verify', 'POST'],
      ['session', 'GET'],
      ['logout', 'POST'],
    ]) {
      const response = await get(
        url + '/api/v1/auth/' + route,
        data.pems.cert,
        { method, headers },
      );
      assert.equal(response.status, 200);
      if (method === 'POST')
        assert.ok(response.headers['set-cookie'][0].includes('Secure'));
    }
    assert.equal(seen.length, 1);
    assert.equal(
      (await get(url, data.pems.cert, { headers: { host: 'evil.example' } }))
        .status,
      421,
    );
    assert.equal(
      (
        await get(url, data.pems.cert, {
          headers: { ...headers, origin: 'https://evil.example' },
        })
      ).status,
      403,
    );
    upstream.closeAllConnections();
    await new Promise((done) => upstream.close(done));
    assert.equal((await get(url, data.pems.cert, { headers })).status, 502);
  } finally {
    await server.close();
    upstream.closeAllConnections();
    if (upstream.listening) await new Promise((done) => upstream.close(done));
  }
});

test('web path classification rejects encoded/private routes before proxying', () => {
  for (const value of [
    '/api/v1/a',
    '/%61pi/a',
    '/HEALTH/a',
    '/a/../api/a',
    '/.env',
    '/a/%2eenv',
    '/a%00b',
    '/local.pem',
    '/a\\b',
  ]) {
    assert.equal(publicWebPath(value), null, value);
  }
  assert.equal(publicWebPath('/markets?next=1'), '/markets');
});
