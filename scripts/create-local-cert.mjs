import { generate } from 'selfsigned';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { X509Certificate } from 'node:crypto';

const directory = fileURLToPath(new URL('../.tools/https/', import.meta.url));
const cert = resolve(directory, 'local.crt');
const key = resolve(directory, 'local.key');
try {
  if (existsSync(cert) || existsSync(key)) throw new Error('EXISTS');
  const now = Date.now();
  const pems = await generate(
    [{ name: 'commonName', value: 'Trading Desk loopback development' }],
    {
      keySize: 2048,
      algorithm: 'sha256',
      notBeforeDate: new Date(now - 60000),
      notAfterDate: new Date(now + 30 * 86400000),
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
        { name: 'subjectAltName', altNames: [{ type: 7, ip: '127.0.0.1' }] },
      ],
    },
  );
  mkdirSync(directory, { recursive: true });
  writeFileSync(key, pems.private, { flag: 'wx', mode: 0o600 });
  writeFileSync(cert, pems.cert, { flag: 'wx' });
  console.log(
    'Created .tools/https/local.crt and local.key; Windows trust is not installed automatically.',
  );
  console.log(
    'Certificate SHA256: ' + new X509Certificate(pems.cert).fingerprint256,
  );
} catch {
  console.error(
    'CERT_SETUP_FAILED: Check file permissions. Existing certificate/key files are never overwritten.',
  );
  process.exitCode = 1;
}
