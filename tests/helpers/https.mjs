import { generate } from 'selfsigned';
import { Buffer } from 'node:buffer';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { request } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { after } from 'node:test';

const directories = [];
after(() => {
  for (const directory of directories) {
    if (!resolve(directory).startsWith(join(tmpdir(), 'desk-https-tests-')))
      throw new Error('Unexpected cleanup path');
    rmSync(directory, { recursive: true, force: true });
  }
});

export async function certificate(ip = '127.0.0.1', expired = false) {
  const now = Date.now();
  return generate([{ name: 'commonName', value: ip }], {
    keySize: 2048,
    algorithm: 'sha256',
    notBeforeDate: new Date(now - 86400000 * 2),
    notAfterDate: new Date(now + (expired ? -86400000 : 86400000)),
    extensions: [
      { name: 'basicConstraints', cA: true },
      {
        name: 'keyUsage',
        digitalSignature: true,
        keyEncipherment: true,
        keyCertSign: true,
      },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames: [{ type: 7, ip }] },
    ],
  });
}

export async function fixture() {
  const pems = await certificate();
  const directory = mkdtempSync(join(tmpdir(), 'desk-https-tests-'));
  directories.push(directory);
  writeFileSync(join(directory, 'local.pem'), pems.cert);
  writeFileSync(join(directory, 'local.key'), pems.private, { mode: 0o600 });
  return {
    directory,
    pems,
    tls: { cert: Buffer.from(pems.cert), key: Buffer.from(pems.private) },
    env: {
      DESK_TLS_CERT_PATH: 'local.pem',
      DESK_TLS_KEY_PATH: 'local.key',
      DESK_OPERATOR_ALLOWLIST: '0x1111111111111111111111111111111111111111',
      DESK_SQL_SERVER: 'test-only',
      DESK_SQL_DATABASE: 'test-only',
    },
  };
}

export function get(url, ca, { method = 'GET', headers = {} } = {}) {
  return new Promise((done, reject) => {
    const req = request(
      url,
      {
        ca,
        method,
        headers,
        agent: false,
        checkServerIdentity: (_hostname, cert) =>
          checkServerIdentity(new URL(url).hostname, cert),
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          done({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}
