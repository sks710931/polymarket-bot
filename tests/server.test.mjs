import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from '../apps/server/dist/index.js';

test('server composition is OBSERVE and all adapters are explicitly unconfigured', async () => {
  const { server, application } = await createServer();
  try {
    assert.equal(application.mode, 'OBSERVE');
    assert.deepEqual(
      application.capabilities.map(({ kind, status }) => ({ kind, status })),
      [
        { kind: 'read-only', status: 'not-configured' },
        { kind: 'read-only', status: 'not-configured' },
        { kind: 'read-only', status: 'not-configured' },
      ],
    );
    assert.equal(server.server.listening, false);
    for (const url of [
      '/api/v1/orders',
      '/api/v1/live/start',
      '/api/v1/live/arm',
      '/api/v1/paper/runs/start',
    ]) {
      const response = await server.inject({ method: 'POST', url });
      assert.equal(response.statusCode, 404, url);
    }
    assert.equal((await server.inject('/health/ready')).statusCode, 404);
  } finally {
    await server.close();
  }
});
