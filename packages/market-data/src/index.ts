import type { ReadOnlyCapability } from '@desk/domain';

// A descriptor, not an initialized connection or a successful integration probe.
export function describeMarketDataAdapter(): ReadOnlyCapability {
  return { name: 'market-data', kind: 'read-only', status: 'not-configured' };
}
