import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  readConfiguration,
  readTlsMaterial,
  frontendEnvironment,
  ConfigurationError,
  SESSION_COOKIE_POLICY,
} from '../apps/server/dist/config.js';
import { fixture, certificate } from './helpers/https.mjs';

const valid = {
  DESK_TLS_CERT_PATH: 'local.pem',
  DESK_TLS_KEY_PATH: 'local.key',
  DESK_OPERATOR_ALLOWLIST: '0x1111111111111111111111111111111111111111',
  DESK_SQL_SERVER: 'test-only',
  DESK_SQL_DATABASE: 'test-only',
};

test('configuration defaults to the one HTTPS OBSERVE origin; absent L2 remains missing', () => {
  const config = readConfiguration(valid);
  assert.equal(config.mode, 'OBSERVE');
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.origin, 'https://127.0.0.1:8443');
  assert.equal(config.l2Configuration, 'missing');
  assert.deepEqual(SESSION_COOKIE_POLICY, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
  });
  assert.equal(
    readConfiguration({ ...valid, POLYMARKET_API_KEY: 'test' }).l2Configuration,
    'partial',
  );
  assert.equal(
    readConfiguration({
      ...valid,
      DESK_PORT: '9443',
      DESK_ORIGIN: 'https://127.0.0.1:9443',
    }).port,
    9443,
  );
});

for (const [name, changes] of [
  ['live', { DESK_MODE: 'LIVE' }],
  ['paper', { DESK_MODE: 'PAPER' }],
  ['public IPv4 bind', { DESK_HOST: '0.0.0.0' }],
  ['public IPv6 bind', { DESK_HOST: '::' }],
  ['localhost alias', { DESK_ORIGIN: 'https://localhost:8443' }],
  ['HTTP origin', { DESK_ORIGIN: 'http://127.0.0.1:8443' }],
  ['origin with path', { DESK_ORIGIN: 'https://127.0.0.1:8443/a' }],
  ['mismatched port', { DESK_PORT: '9443' }],
  ['ephemeral runtime port', { DESK_PORT: '0' }],
  [
    'reserved helper port',
    { DESK_PORT: '5173', DESK_ORIGIN: 'https://127.0.0.1:5173' },
  ],
  ['missing operator', { DESK_OPERATOR_ALLOWLIST: '' }],
  [
    'zero operator',
    { DESK_OPERATOR_ALLOWLIST: '0x0000000000000000000000000000000000000000' },
  ],
  [
    'multiple operators',
    {
      DESK_OPERATOR_ALLOWLIST:
        valid.DESK_OPERATOR_ALLOWLIST + ',' + valid.DESK_OPERATOR_ALLOWLIST,
    },
  ],
  ['missing database', { DESK_SQL_DATABASE: '' }],
  ['missing TLS path', { DESK_TLS_KEY_PATH: '' }],
  [
    'browser environment variable',
    { VITE_POLYMARKET_API_SECRET: 'never-log-this' },
  ],
]) {
  test('rejects ' + name + ' with a sanitized error', () => {
    assert.throws(
      () => readConfiguration({ ...valid, ...changes }),
      (error) => {
        assert.ok(error instanceof ConfigurationError);
        assert.ok(!error.message.includes('never-log-this'));
        assert.ok(!error.message.includes(valid.DESK_OPERATOR_ALLOWLIST));
        return true;
      },
    );
  });
}

test('Vite receives a narrow OS environment, never arbitrary credentials or Node injection', () => {
  assert.deepEqual(
    frontendEnvironment({
      Path: 'os-path',
      SystemRoot: 'os-root',
      POLYMARKET_API_KEY: 'secret',
      DESK_OPERATOR_ALLOWLIST: 'operator',
      VITE_TOKEN: 'secret',
      NODE_OPTIONS: '--inspect',
      OTHER_TOKEN: 'secret',
    }),
    { NODE_ENV: 'development', Path: 'os-path', SystemRoot: 'os-root' },
  );
});

test('TLS validates SAN, expiry, matching key and sanitized read failures', async () => {
  const data = await fixture();
  const config = readConfiguration(data.env);
  assert.ok(readTlsMaterial(config, data.directory).cert.length);
  assert.throws(
    () =>
      readTlsMaterial({ ...config, keyPath: 'missing-key' }, data.directory),
    /TLS_FILES/,
  );
  const wrong = await certificate('127.0.0.2');
  writeFileSync(join(data.directory, 'wrong.pem'), wrong.cert);
  assert.throws(
    () =>
      readTlsMaterial(
        { ...config, certificatePath: 'wrong.pem' },
        data.directory,
      ),
    /TLS_IDENTITY/,
  );
  const expired = await certificate('127.0.0.1', true);
  writeFileSync(join(data.directory, 'expired.pem'), expired.cert);
  assert.throws(
    () =>
      readTlsMaterial(
        { ...config, certificatePath: 'expired.pem' },
        data.directory,
      ),
    /TLS_EXPIRY/,
  );
  const different = await certificate();
  writeFileSync(join(data.directory, 'different.key'), different.private);
  assert.throws(
    () =>
      readTlsMaterial({ ...config, keyPath: 'different.key' }, data.directory),
    /TLS_PAIR/,
  );
});
