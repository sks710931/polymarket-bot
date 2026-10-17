import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { X509Certificate, createPrivateKey } from 'node:crypto';
import { createSecureContext } from 'node:tls';

export class ConfigurationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(code + ': ' + message);
    this.name = 'ConfigurationError';
  }
}

export interface RuntimeConfig {
  readonly mode: 'OBSERVE';
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly origin: string;
  readonly certificatePath: string;
  readonly keyPath: string;
  readonly operatorAddress: string;
  readonly database: { readonly server: string; readonly name: string };
  readonly l2Configuration: 'missing' | 'partial' | 'configured';
}

export interface TlsMaterial {
  readonly cert: Buffer;
  readonly key: Buffer;
}

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name]?.trim();
  if (!value || /[\r\n\0]/.test(value)) {
    throw new ConfigurationError(
      'CONFIG_REQUIRED',
      'Set a valid ' + name + ' in the server environment.',
    );
  }
  return value;
};

export function readConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  if ((env['DESK_MODE'] ?? 'OBSERVE') !== 'OBSERVE') {
    throw new ConfigurationError('CONFIG_MODE', 'DESK_MODE must be OBSERVE.');
  }
  if ((env['DESK_HOST'] ?? '127.0.0.1') !== '127.0.0.1') {
    throw new ConfigurationError('CONFIG_HOST', 'DESK_HOST must be 127.0.0.1.');
  }
  if (Object.keys(env).some((name) => name.startsWith('VITE_') && env[name])) {
    throw new ConfigurationError(
      'CONFIG_PUBLIC_ENV',
      'VITE_* environment variables are unsupported; keep configuration server-only.',
    );
  }
  const portText = env['DESK_PORT'] ?? '8443';
  const port = Number(portText);
  if (
    !/^\d+$/.test(portText) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    port === 5173
  ) {
    throw new ConfigurationError(
      'CONFIG_PORT',
      'DESK_PORT must be a valid port other than the reserved Vite port 5173.',
    );
  }
  const origin = env['DESK_ORIGIN'] ?? 'https://127.0.0.1:8443';
  const expectedOrigin = 'https://127.0.0.1' + (port === 443 ? '' : ':' + port);
  if (origin !== expectedOrigin) {
    throw new ConfigurationError(
      'CONFIG_ORIGIN',
      'DESK_ORIGIN must be the exact HTTPS loopback origin matching DESK_PORT, without a path.',
    );
  }
  const operator = required(env, 'DESK_OPERATOR_ALLOWLIST');
  if (!/^0x[0-9a-fA-F]{40}$/.test(operator) || /^0x0{40}$/.test(operator)) {
    throw new ConfigurationError(
      'CONFIG_OPERATOR',
      'DESK_OPERATOR_ALLOWLIST must contain exactly one nonzero Ethereum address.',
    );
  }
  const keys = [
    'POLYMARKET_API_KEY',
    'POLYMARKET_API_PASSPHRASE',
    'POLYMARKET_API_SECRET',
  ];
  const configured = keys.filter((key) => Boolean(env[key]?.trim())).length;
  return Object.freeze({
    mode: 'OBSERVE',
    host: '127.0.0.1',
    port,
    origin,
    certificatePath: required(env, 'DESK_TLS_CERT_PATH'),
    keyPath: required(env, 'DESK_TLS_KEY_PATH'),
    operatorAddress: operator.toLowerCase(),
    database: Object.freeze({
      server: required(env, 'DESK_SQL_SERVER'),
      name: required(env, 'DESK_SQL_DATABASE'),
    }),
    l2Configuration:
      configured === 0
        ? 'missing'
        : configured === 3
          ? 'configured'
          : 'partial',
  });
}

export function readTlsMaterial(
  config: RuntimeConfig,
  directory: string,
): TlsMaterial {
  let cert: Buffer, key: Buffer;
  try {
    cert = readFileSync(resolve(directory, config.certificatePath));
    key = readFileSync(resolve(directory, config.keyPath));
  } catch {
    throw new ConfigurationError(
      'TLS_FILES',
      'Check DESK_TLS_CERT_PATH and DESK_TLS_KEY_PATH; both must be readable PEM files.',
    );
  }
  try {
    const certificate = new X509Certificate(cert);
    if (
      certificate.subjectAltName !== 'IP Address:127.0.0.1' ||
      !certificate.checkIP('127.0.0.1')
    ) {
      throw new ConfigurationError(
        'TLS_IDENTITY',
        'The certificate SAN must contain only IP address 127.0.0.1.',
      );
    }
    const now = Date.now();
    if (
      now < Date.parse(certificate.validFrom) ||
      now >= Date.parse(certificate.validTo)
    ) {
      throw new ConfigurationError(
        'TLS_EXPIRY',
        'The local TLS certificate is expired or not yet valid.',
      );
    }
    if (!certificate.checkPrivateKey(createPrivateKey(key))) {
      throw new ConfigurationError(
        'TLS_PAIR',
        'The TLS certificate and private key do not match.',
      );
    }
    createSecureContext({ cert, key, minVersion: 'TLSv1.2' });
    return { cert, key };
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError(
      'TLS_INVALID',
      'The TLS certificate/key pair is not a valid unencrypted PEM pair.',
    );
  }
}

// Only these non-secret OS variables reach the Vite helper. Do not spread process.env.
export function frontendEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { NODE_ENV: 'development' };
  const allowed = new Set([
    'path',
    'systemroot',
    'windir',
    'comspec',
    'pathext',
    'temp',
    'tmp',
  ]);
  for (const [name, value] of Object.entries(env)) {
    if (allowed.has(name.toLowerCase()) && value !== undefined)
      result[name] = value;
  }
  return result;
}

export const SESSION_COOKIE_POLICY = Object.freeze({
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/',
} as const);
