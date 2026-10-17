import Fastify from 'fastify';
import { createObserveApplication } from '@desk/application';
import { describeMarketDataAdapter } from '@desk/market-data';
import { describePersistenceAdapter } from '@desk/persistence';
import { describePolymarketReadAdapter } from '@desk/polymarket-adapter';
import type { TlsMaterial } from './config.js';
import { registerWeb, type WebOptions } from './web.js';

// No SDK client, credentials, private endpoints, or trading adapter.
// Health/readiness and owner authentication arrive in their respective issues.
export async function createServer(
  options: {
    tls?: TlsMaterial;
    origin?: string;
    web?: WebOptions;
  } = {},
) {
  const application = createObserveApplication([
    describeMarketDataAdapter(),
    describePersistenceAdapter(),
    describePolymarketReadAdapter(),
  ]);
  const server = Fastify({
    https: options.tls ?? null,
    logger: false,
    forceCloseConnections: true,
    bodyLimit: 4096,
  });
  server.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    const inlineStyles = options.web?.kind === 'dev' ? " 'unsafe-inline'" : '';
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'" +
        inlineStyles +
        "; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    if (options.origin) {
      if (request.headers.host !== new URL(options.origin).host)
        return reply.code(421).send({ error: 'HOST_REJECTED' });
      if (request.headers.origin && request.headers.origin !== options.origin)
        return reply.code(403).send({ error: 'ORIGIN_REJECTED' });
    }
  });
  server.setErrorHandler((error, _request, reply) => {
    const code =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? error.statusCode
        : undefined;
    const status =
      typeof code === 'number' && code >= 400 && code < 500 ? code : 500;
    return reply.code(status).send({ error: 'REQUEST_FAILED' });
  });
  if (options.web) await registerWeb(server, options.web);
  return { server, application };
}
