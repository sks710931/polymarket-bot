import Fastify from 'fastify';
import { createObserveApplication } from '@desk/application';
import { describeMarketDataAdapter } from '@desk/market-data';
import { describePersistenceAdapter } from '@desk/persistence';
import { describePolymarketReadAdapter } from '@desk/polymarket-adapter';

// No listener, SDK client, credentials, private endpoints, or trading adapter.
// Local HTTPS/configuration belongs to issue #4; health/readiness to issue #8.
export function createServer() {
  const application = createObserveApplication([
    describeMarketDataAdapter(),
    describePersistenceAdapter(),
    describePolymarketReadAdapter(),
  ]);
  const server = Fastify({ logger: false });
  return { server, application };
}
